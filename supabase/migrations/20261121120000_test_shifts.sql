-- Тестова зміна для супроводу: позначка is_test і час закриття expires_at.
-- Після expires_at pg_cron щохвилини видаляє таку зміну разом з дітьми, розкладом,
-- призначеннями (каскад) і її сповіщеннями; команди супроводу з неї скидаються.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Кому вже надіслано запрошення (щоб повторна розсилка не дублювала).
CREATE TABLE IF NOT EXISTS public.test_shift_invites (
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  tg_user_id bigint NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shift_id, tg_user_id)
);
ALTER TABLE public.test_shift_invites ENABLE ROW LEVEL SECURITY;

-- Одноразові службові токени (зберігається лише sha256); політик немає — читає тільки service role.
CREATE TABLE IF NOT EXISTS public.ops_tokens (
  token_hash text PRIMARY KEY,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.ops_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_shift_invites, public.ops_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.purge_expired_test_shifts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_n integer;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.shifts WHERE is_test AND expires_at IS NOT NULL AND expires_at <= now();
  DELETE FROM public.ops_tokens WHERE expires_at <= now();
  IF v_ids IS NULL THEN RETURN 0; END IF;

  -- Супровід, який заходив у тестову команду, повертається «без команди».
  UPDATE public.user_roles r SET team_number = NULL
  WHERE r.role = 'supervisor'
    AND EXISTS (SELECT 1 FROM public.staff_assignments a
                WHERE a.shift_id = ANY (v_ids) AND a.staff_user_id = r.user_id AND a.team_number = r.team_number);
  DELETE FROM public.notifications WHERE shift_id = ANY (v_ids);
  DELETE FROM public.shifts WHERE id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION private.purge_expired_test_shifts() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-expired-test-shifts';
SELECT cron.schedule('purge-expired-test-shifts', '* * * * *', $$SELECT private.purge_expired_test_shifts()$$);
