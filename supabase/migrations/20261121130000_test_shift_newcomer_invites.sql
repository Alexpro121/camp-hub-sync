-- Пізно підтверджений супровід отримує запрошення в тестову зміну: щохвилинна задача
-- 'test-shift-invites' (pg_cron + pg_net) викликає функцію test-shift, яка надсилає лише тим,
-- кого ще не запрошено. Задачу з одноразовим токеном створюють окремо (токен не зберігається в репозиторії);
-- прибирання знімає її, щойно відкритих тестових змін не лишилось.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION private.purge_expired_test_shifts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_n integer := 0;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.shifts WHERE is_test AND expires_at IS NOT NULL AND expires_at <= now();
  DELETE FROM public.ops_tokens WHERE expires_at <= now();
  IF v_ids IS NOT NULL THEN
    UPDATE public.user_roles r SET team_number = NULL
    WHERE r.role = 'supervisor'
      AND EXISTS (SELECT 1 FROM public.staff_assignments a
                  WHERE a.shift_id = ANY (v_ids) AND a.staff_user_id = r.user_id AND a.team_number = r.team_number);
    DELETE FROM public.notifications WHERE shift_id = ANY (v_ids);
    DELETE FROM public.shifts WHERE id = ANY (v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shifts WHERE is_test AND expires_at > now()) THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'test-shift-invites';
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION private.purge_expired_test_shifts() FROM PUBLIC, anon, authenticated;
