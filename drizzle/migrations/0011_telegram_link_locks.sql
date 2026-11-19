-- Прив'язки Telegram без гонок і ліміт спроб дитини, який не обійти паралельними запитами.
-- 1. telegram_link_child / telegram_link_staff: перевірка «цей Telegram уже прив'язаний» і запис
--    тепер ідуть під блокуванням за Telegram ID. Раніше два паралельні запити з одного Telegram
--    обидва проходили перевірку, і другий через ON CONFLICT тихо перезаписував першу прив'язку.
--    Додатково ON CONFLICT оновлює лише неактивний запис: активна прив'язка ніколи не перезаписується.

CREATE OR REPLACE FUNCTION public.telegram_link_child(p_tg bigint, p_child uuid, p_username text, p_name text, p_approved_by bigint, p_replace boolean)
RETURNS bigint[] LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_old bigint[] := '{}';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram_link:' || p_tg::text, 0));
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
    admin_from_env = false, updated_at = now()
  WHERE telegram_links.status <> 'active' OR (telegram_links.kind = 'child' AND telegram_links.child_id = p_child);
  IF NOT FOUND THEN RAISE EXCEPTION 'tg_already_linked'; END IF;
  RETURN v_old;
END $$;

CREATE OR REPLACE FUNCTION public.telegram_link_staff(p_tg bigint, p_user uuid, p_username text, p_name text, p_approved_by bigint)
RETURNS bigint[] LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_old bigint[] := '{}';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram_link:' || p_tg::text, 0));
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
    tg_username = excluded.tg_username, tg_name = excluded.tg_name, approved_by_tg = excluded.approved_by_tg, updated_at = now()
  WHERE telegram_links.status <> 'active' OR (telegram_links.kind = 'staff' AND telegram_links.user_id = p_user);
  IF NOT FOUND THEN RAISE EXCEPTION 'tg_already_linked'; END IF;
  RETURN v_old;
END $$;

-- 2. Спроба пошуку дитини: підрахунок і запис під одним блокуванням (раніше паралельні запити проскакували ліміт).
--    Повертає true, якщо спробу зараховано, і false, якщо ліміт вичерпано.
CREATE FUNCTION public.telegram_child_attempt(p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tg-child:' || p_key, 0));
  IF (SELECT count(*) FROM login_attempts
      WHERE scope = 'tg-child' AND key = p_key AND created_at >= now() - make_interval(secs => p_window_seconds)) >= p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO login_attempts (scope, key) VALUES ('tg-child', p_key);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.telegram_link_child(bigint, uuid, text, text, bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_link_staff(bigint, uuid, text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_child_attempt(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_link_child(bigint, uuid, text, text, bigint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_link_staff(bigint, uuid, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_child_attempt(text, integer, integer) TO service_role;
