CREATE OR REPLACE FUNCTION public.get_available_transfer_teams(p_shift_id uuid, p_my_team int)
RETURNS TABLE (team_number int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY';
  END IF;
  RETURN QUERY
  SELECT DISTINCT c.team_number
  FROM public.children c
  WHERE (p_shift_id IS NULL OR c.shift_id = p_shift_id)
    AND c.team_number <> p_my_team
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_transfer_teams(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_transfer_teams(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_child_for_transfer(p_query text, p_shift_id uuid, p_my_team int)
RETURNS TABLE (id uuid, full_name text, team_number int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY';
  END IF;
  IF p_query IS NULL OR length(btrim(p_query)) < 2 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT c.id, c.full_name, c.team_number
  FROM public.children c
  WHERE (p_shift_id IS NULL OR c.shift_id = p_shift_id)
    AND c.team_number <> p_my_team
    AND c.full_name ILIKE '%' || btrim(p_query) || '%'
  ORDER BY c.full_name
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.search_child_for_transfer(text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_child_for_transfer(text, uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_child_transfer(p_child_id uuid, p_target_team int, p_performed_by text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_old_team int;
  v_child_name text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY';
  END IF;
  IF p_target_team IS NULL OR p_target_team <= 0 THEN
    RAISE EXCEPTION 'INVALID_TEAM';
  END IF;

  SELECT c.team_number, c.full_name INTO v_old_team, v_child_name
  FROM public.children c WHERE c.id = p_child_id FOR UPDATE;

  IF v_old_team IS NULL THEN
    RAISE EXCEPTION 'CHILD_NOT_FOUND';
  END IF;
  IF v_old_team = p_target_team THEN
    RETURN FALSE;
  END IF;

  UPDATE public.children SET team_number = p_target_team, updated_at = now() WHERE id = p_child_id;

  INSERT INTO public.transfers (child_id, child_full_name, from_team, to_team, performed_by)
  VALUES (p_child_id, v_child_name, v_old_team, p_target_team, p_performed_by);

  INSERT INTO public.notifications (type, title, message, metadata)
  VALUES ('transfer', 'Переведення',
          v_child_name || ': команда #' || v_old_team::text || ' → #' || p_target_team::text,
          jsonb_build_object('child_id', p_child_id, 'from_team', v_old_team, 'to_team', p_target_team));

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_child_transfer(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_child_transfer(uuid, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_child_swap(p_child_1_id uuid, p_child_2_id uuid, p_performed_by text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_team_1 int; v_team_2 int; v_name_1 text; v_name_2 text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY';
  END IF;
  IF p_child_1_id = p_child_2_id THEN
    RAISE EXCEPTION 'SAME_CHILD';
  END IF;

  SELECT c.team_number, c.full_name INTO v_team_1, v_name_1 FROM public.children c WHERE c.id = p_child_1_id FOR UPDATE;
  SELECT c.team_number, c.full_name INTO v_team_2, v_name_2 FROM public.children c WHERE c.id = p_child_2_id FOR UPDATE;

  IF v_team_1 IS NULL OR v_team_2 IS NULL THEN
    RAISE EXCEPTION 'CHILDREN_NOT_FOUND';
  END IF;
  IF v_team_1 = v_team_2 THEN
    RAISE EXCEPTION 'SAME_TEAM';
  END IF;

  UPDATE public.children SET team_number = v_team_2, updated_at = now() WHERE id = p_child_1_id;
  UPDATE public.children SET team_number = v_team_1, updated_at = now() WHERE id = p_child_2_id;

  INSERT INTO public.transfers (child_id, child_full_name, from_team, to_team, performed_by)
  VALUES
    (p_child_1_id, v_name_1, v_team_1, v_team_2, p_performed_by),
    (p_child_2_id, v_name_2, v_team_2, v_team_1, p_performed_by);

  INSERT INTO public.notifications (type, title, message, metadata)
  VALUES ('swap', 'Заміна',
          v_name_1 || ' (#' || v_team_1::text || ') ⇄ ' || v_name_2 || ' (#' || v_team_2::text || ')',
          jsonb_build_object('a', p_child_1_id, 'b', p_child_2_id, 'team_a', v_team_1, 'team_b', v_team_2));

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_child_swap(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_child_swap(uuid, uuid, text) TO authenticated;