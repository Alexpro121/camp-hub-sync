CREATE OR REPLACE FUNCTION private.actor_label(_uid uuid, _fallback text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT COALESCE(
    (SELECT sm.full_name || CASE WHEN sm.kind = 'duckling' THEN ' (каченя)' ELSE ' (супровід)' END
       FROM public.staff_members sm WHERE sm.user_id = _uid),
    CASE WHEN private.has_role(_uid, 'admin') THEN 'Адміністратор' END,
    NULLIF(btrim(_fallback), ''),
    'Невідомо');
$$;

CREATE OR REPLACE FUNCTION public.execute_child_transfer(p_child_id uuid, p_target_team integer, p_performed_by text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE v_old_team int; v_child_name text; v_my_team int; v_actor text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_target_team IS NULL OR p_target_team <= 0 THEN RAISE EXCEPTION 'INVALID_TEAM'; END IF;
  SELECT c.team_number, c.full_name INTO v_old_team, v_child_name FROM public.children c WHERE c.id = p_child_id FOR UPDATE;
  IF v_old_team IS NULL THEN RAISE EXCEPTION 'CHILD_NOT_FOUND'; END IF;
  IF NOT private.has_role(auth.uid(), 'admin') THEN
    v_my_team := private.my_team(auth.uid());
    IF v_my_team IS NULL OR (v_old_team <> v_my_team AND p_target_team <> v_my_team) THEN RAISE EXCEPTION 'forbidden_foreign_team_transfer'; END IF;
  END IF;
  IF v_old_team = p_target_team THEN RETURN FALSE; END IF;
  v_actor := private.actor_label(auth.uid(), p_performed_by);
  UPDATE public.children SET team_number = p_target_team, updated_at = now() WHERE id = p_child_id;
  INSERT INTO public.transfers (child_id, child_full_name, from_team, to_team, performed_by)
  VALUES (p_child_id, v_child_name, v_old_team, p_target_team, v_actor);
  INSERT INTO public.notifications (type, title, message, metadata)
  VALUES ('transfer', 'Переведення',
          v_child_name || ': команда #' || v_old_team::text || ' → #' || p_target_team::text,
          jsonb_build_object('child_id', p_child_id, 'from_team', v_old_team, 'to_team', p_target_team, 'actor', v_actor, 'actor_id', auth.uid()));
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.execute_child_swap(p_child_1_id uuid, p_child_2_id uuid, p_performed_by text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE v_team_1 int; v_team_2 int; v_name_1 text; v_name_2 text; v_my_team int; v_actor text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_child_1_id = p_child_2_id THEN RAISE EXCEPTION 'SAME_CHILD'; END IF;
  SELECT c.team_number, c.full_name INTO v_team_1, v_name_1 FROM public.children c WHERE c.id = p_child_1_id FOR UPDATE;
  SELECT c.team_number, c.full_name INTO v_team_2, v_name_2 FROM public.children c WHERE c.id = p_child_2_id FOR UPDATE;
  IF v_team_1 IS NULL OR v_team_2 IS NULL THEN RAISE EXCEPTION 'CHILDREN_NOT_FOUND'; END IF;
  IF v_team_1 = v_team_2 THEN RAISE EXCEPTION 'SAME_TEAM'; END IF;
  IF NOT private.has_role(auth.uid(), 'admin') THEN
    v_my_team := private.my_team(auth.uid());
    IF v_my_team IS NULL OR (v_team_1 <> v_my_team AND v_team_2 <> v_my_team) THEN RAISE EXCEPTION 'forbidden_foreign_team_transfer'; END IF;
  END IF;
  v_actor := private.actor_label(auth.uid(), p_performed_by);
  UPDATE public.children SET team_number = v_team_2, updated_at = now() WHERE id = p_child_1_id;
  UPDATE public.children SET team_number = v_team_1, updated_at = now() WHERE id = p_child_2_id;
  INSERT INTO public.transfers (child_id, child_full_name, from_team, to_team, performed_by)
  VALUES (p_child_1_id, v_name_1, v_team_1, v_team_2, v_actor), (p_child_2_id, v_name_2, v_team_2, v_team_1, v_actor);
  INSERT INTO public.notifications (type, title, message, metadata)
  VALUES ('swap', 'Заміна',
          v_name_1 || ' (#' || v_team_1::text || ') ⇄ ' || v_name_2 || ' (#' || v_team_2::text || ')',
          jsonb_build_object('a', p_child_1_id, 'b', p_child_2_id, 'team_a', v_team_1, 'team_b', v_team_2, 'actor', v_actor, 'actor_id', auth.uid()));
  RETURN TRUE;
END; $function$;

REVOKE ALL ON FUNCTION private.actor_label(uuid, text) FROM PUBLIC, anon;