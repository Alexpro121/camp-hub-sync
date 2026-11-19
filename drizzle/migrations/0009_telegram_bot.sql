-- Вхід через Telegram-бота: хто є хто визначає сервер за числовим Telegram ID.
-- Усі таблиці доступні лише серверним функціям (service_role): клієнт не бачить
-- прив'язок, заявок і станів діалогу навіть через прямі запити до API.

-- 1. Прив'язка Telegram-акаунта до дитини або до акаунта супроводу.
CREATE TABLE public.telegram_links (
  tg_user_id bigint PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('child', 'staff')),
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  tg_username text,
  tg_name text,
  approved_by_tg bigint,
  -- Роль адміна видано зі списку TELEGRAM_ADMIN_IDS: прибирається, коли ID зі списку видалять.
  admin_from_env boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telegram_links_identity CHECK (
    (kind = 'child' AND child_id IS NOT NULL AND user_id IS NULL)
    OR (kind = 'staff' AND user_id IS NOT NULL AND child_id IS NULL)
  )
);
-- Один запис дитини і один акаунт супроводу відкриваються лише з одного Telegram.
CREATE UNIQUE INDEX telegram_links_one_active_child ON public.telegram_links (child_id) WHERE status = 'active' AND kind = 'child';
CREATE UNIQUE INDEX telegram_links_one_active_staff ON public.telegram_links (user_id) WHERE status = 'active' AND kind = 'staff';

-- 2. Заявки /register (супровід, каченята, лікарі). Діють лише після підтвердження адміном.
CREATE TABLE public.telegram_staff_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id bigint NOT NULL,
  tg_username text,
  tg_name text,
  full_name text NOT NULL,
  phone text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('supervisor', 'duckling', 'doctor')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by_tg bigint,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX telegram_staff_requests_one_pending ON public.telegram_staff_requests (tg_user_id) WHERE status = 'pending';

-- 3. Запити на переприв'язку дитини до іншого Telegram (новий телефон тощо). Вирішує супровід команди.
CREATE TABLE public.telegram_rebind_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  tg_user_id bigint NOT NULL,
  tg_username text,
  tg_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by_tg bigint,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX telegram_rebind_requests_one_pending ON public.telegram_rebind_requests (child_id, tg_user_id) WHERE status = 'pending';

-- 4. Крок діалогу з ботом (функції без стану, тому крок зберігаємо в базі).
CREATE TABLE public.telegram_bot_state (
  tg_user_id bigint PRIMARY KEY,
  step text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Атомарна прив'язка: відкликання старих прив'язок і нова прив'язка в одній транзакції.
--    Telegram, що вже має іншу активну прив'язку, не перезаписується (помилка tg_already_linked).
CREATE FUNCTION public.telegram_link_child(p_tg bigint, p_child uuid, p_username text, p_name text, p_approved_by bigint, p_replace boolean)
RETURNS bigint[] LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_old bigint[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM telegram_links WHERE tg_user_id = p_tg AND status = 'active' AND NOT (kind = 'child' AND child_id = p_child)) THEN
    RAISE EXCEPTION 'tg_already_linked';
  END IF;
  IF p_replace THEN
    WITH r AS (
      UPDATE telegram_links SET status = 'revoked', updated_at = now()
      WHERE kind = 'child' AND child_id = p_child AND status = 'active' AND tg_user_id <> p_tg
      RETURNING tg_user_id
    ) SELECT coalesce(array_agg(tg_user_id), '{}') INTO v_old FROM r;
  END IF;
  -- Без p_replace зайнятий профіль дасть 23505 (унікальний індекс) — це конфлікт для супроводу.
  INSERT INTO telegram_links (tg_user_id, kind, child_id, user_id, status, tg_username, tg_name, approved_by_tg, admin_from_env, updated_at)
  VALUES (p_tg, 'child', p_child, NULL, 'active', p_username, p_name, p_approved_by, false, now())
  ON CONFLICT (tg_user_id) DO UPDATE SET kind = 'child', child_id = p_child, user_id = NULL, status = 'active',
    tg_username = excluded.tg_username, tg_name = excluded.tg_name, approved_by_tg = excluded.approved_by_tg,
    admin_from_env = false, updated_at = now();
  RETURN v_old;
END $$;

CREATE FUNCTION public.telegram_link_staff(p_tg bigint, p_user uuid, p_username text, p_name text, p_approved_by bigint)
RETURNS bigint[] LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_old bigint[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM telegram_links WHERE tg_user_id = p_tg AND status = 'active' AND NOT (kind = 'staff' AND user_id = p_user)) THEN
    RAISE EXCEPTION 'tg_already_linked';
  END IF;
  WITH r AS (
    UPDATE telegram_links SET status = 'revoked', updated_at = now()
    WHERE kind = 'staff' AND user_id = p_user AND status = 'active' AND tg_user_id <> p_tg
    RETURNING tg_user_id
  ) SELECT coalesce(array_agg(tg_user_id), '{}') INTO v_old FROM r;
  INSERT INTO telegram_links (tg_user_id, kind, child_id, user_id, status, tg_username, tg_name, approved_by_tg, updated_at)
  VALUES (p_tg, 'staff', NULL, p_user, 'active', p_username, p_name, p_approved_by, now())
  ON CONFLICT (tg_user_id) DO UPDATE SET kind = 'staff', child_id = NULL, user_id = p_user, status = 'active',
    tg_username = excluded.tg_username, tg_name = excluded.tg_name, approved_by_tg = excluded.approved_by_tg, updated_at = now();
  RETURN v_old;
END $$;

-- 6. Сесії відкликаються при переприв'язці: видаляємо всі сесії (і refresh-токени) акаунта.
CREATE FUNCTION public.telegram_revoke_sessions(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM auth.sessions WHERE user_id = p_user;
$$;

REVOKE ALL ON FUNCTION public.telegram_link_child(bigint, uuid, text, text, bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_link_staff(bigint, uuid, text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_revoke_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_link_child(bigint, uuid, text, text, bigint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_link_staff(bigint, uuid, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_revoke_sessions(uuid) TO service_role;

REVOKE ALL ON public.telegram_links, public.telegram_staff_requests, public.telegram_rebind_requests, public.telegram_bot_state FROM anon, authenticated;
GRANT ALL ON public.telegram_links, public.telegram_staff_requests, public.telegram_rebind_requests, public.telegram_bot_state TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_staff_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_rebind_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.telegram_links IS 'Telegram account -> child or staff identity; accessed only by server functions.';
COMMENT ON TABLE public.telegram_staff_requests IS 'Pending /register requests from staff, doctors and ducklings; approved by an admin in the bot.';
COMMENT ON TABLE public.telegram_rebind_requests IS 'Requests to move a child profile to another Telegram account; decided by the team supervisor.';
COMMENT ON TABLE public.telegram_bot_state IS 'Per-user conversation step of the Telegram bot.';
