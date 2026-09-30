CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in can read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update settings" ON public.app_settings FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
INSERT INTO public.app_settings(key, value) VALUES ('transfer_approval', '"off"') ON CONFLICT DO NOTHING;

CREATE TABLE public.transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('transfer','swap')),
  child_1_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  child_2_id uuid REFERENCES public.children(id) ON DELETE CASCADE,
  target_team integer,
  summary text NOT NULL,
  gender_mismatch boolean NOT NULL DEFAULT false,
  requested_by uuid NOT NULL,
  requested_label text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transfer_requests TO authenticated;
GRANT ALL ON public.transfer_requests TO service_role;
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin can read requests" ON public.transfer_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR private.has_role(auth.uid(), 'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.transfer_requests;

-- Guard: direct execution by non-admins must pass the approval rule (bypass flag set only by our RPCs).
CREATE OR REPLACE FUNCTION private.move_needs_approval(p_mismatch boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT NOT private.has_role(auth.uid(), 'admin')
     AND COALESCE(current_setting('app.move_approved', true), '') <> '1'
     AND CASE COALESCE((SELECT value #>> '{}' FROM public.app_settings WHERE key = 'transfer_approval'), 'off')
           WHEN 'all' THEN true
           WHEN 'gender_mismatch' THEN p_mismatch
           ELSE false END;
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
  IF NOT private.has_role(auth.uid(), 'admin') AND COALESCE(current_setting('app.move_approved', true), '') <> '1' THEN
    v_my_team := private.my_team(auth.uid());
    IF v_my_team IS NULL OR (v_old_team <> v_my_team AND p_target_team <> v_my_team) THEN RAISE EXCEPTION 'forbidden_foreign_team_transfer'; END IF;
    IF private.move_needs_approval(false) THEN RAISE EXCEPTION 'APPROVAL_REQUIRED'; END IF;
  END IF;
  IF v_old_team = p_target_team THEN RETURN FALSE; END IF;
  v_actor := private.actor_label(auth.uid(), p_performed_by);
  UPDATE public.children SET team_number = p_target_team, updated_at = now() WHERE id = p_child_id;
  INSERT INTO public.transfers (child_id, child_full_name, from_team, to_team, performed_by)
  VALUES (p_child_id, v_child_name, v_old_team, p_target_team, v_actor);
  INSERT INTO public.notifications (type, title, message, metadata)
  VALUES ('transfer', 'Переведення', v_child_name || ': команда #' || v_old_team::text || ' → #' || p_target_team::text,
          jsonb_build_object('child_id', p_child_id, 'from_team', v_old_team, 'to_team', p_target_team, 'actor', v_actor, 'actor_id', auth.uid()));
  RETURN TRUE;
END; $function$;

CREATE OR REPLACE FUNCTION public.execute_child_swap(p_child_1_id uuid, p_child_2_id uuid, p_performed_by text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE v_team_1 int; v_team_2 int; v_name_1 text; v_name_2 text; v_g1 text; v_g2 text; v_my_team int; v_actor text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_child_1_id = p_child_2_id THEN RAISE EXCEPTION 'SAME_CHILD'; END IF;
  SELECT c.team_number, c.full_name, c.gender INTO v_team_1, v_name_1, v_g1 FROM public.children c WHERE c.id = p_child_1_id FOR UPDATE;
  SELECT c.team_number, c.full_name, c.gender INTO v_team_2, v_name_2, v_g2 FROM public.children c WHERE c.id = p_child_2_id FOR UPDATE;
  IF v_team_1 IS NULL OR v_team_2 IS NULL THEN RAISE EXCEPTION 'CHILDREN_NOT_FOUND'; END IF;
  IF v_team_1 = v_team_2 THEN RAISE EXCEPTION 'SAME_TEAM'; END IF;
  IF NOT private.has_role(auth.uid(), 'admin') AND COALESCE(current_setting('app.move_approved', true), '') <> '1' THEN
    v_my_team := private.my_team(auth.uid());
    IF v_my_team IS NULL OR (v_team_1 <> v_my_team AND v_team_2 <> v_my_team) THEN RAISE EXCEPTION 'forbidden_foreign_team_transfer'; END IF;
    IF private.move_needs_approval(v_g1 IN ('boy','girl') AND v_g2 IN ('boy','girl') AND v_g1 <> v_g2) THEN RAISE EXCEPTION 'APPROVAL_REQUIRED'; END IF;
  END IF;
  v_actor := private.actor_label(auth.uid(), p_performed_by);
  UPDATE public.children SET team_number = v_team_2, updated_at = now() WHERE id = p_child_1_id;
  UPDATE public.children SET team_number = v_team_1, updated_at = now() WHERE id = p_child_2_id;
  INSERT INTO public.transfers (child_id, child_full_name, from_team, to_team, performed_by)
  VALUES (p_child_1_id, v_name_1, v_team_1, v_team_2, v_actor), (p_child_2_id, v_name_2, v_team_2, v_team_1, v_actor);
  INSERT INTO public.notifications (type, title, message, metadata)
  VALUES ('swap', 'Заміна', v_name_1 || ' (#' || v_team_1::text || ') ⇄ ' || v_name_2 || ' (#' || v_team_2::text || ')',
          jsonb_build_object('a', p_child_1_id, 'b', p_child_2_id, 'team_a', v_team_1, 'team_b', v_team_2, 'actor', v_actor, 'actor_id', auth.uid()));
  RETURN TRUE;
END; $function$;

-- Supervisor entry point: executes directly or files a request for admin approval.
CREATE OR REPLACE FUNCTION public.request_child_move(p_kind text, p_child_1_id uuid, p_child_2_id uuid, p_target_team integer, p_performed_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE c1 public.children%ROWTYPE; c2 public.children%ROWTYPE; v_my int; v_mis boolean := false; v_id uuid; v_sum text; v_actor text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_kind NOT IN ('transfer','swap') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
  SELECT * INTO c1 FROM public.children WHERE id = p_child_1_id;
  IF c1.id IS NULL THEN RAISE EXCEPTION 'CHILD_NOT_FOUND'; END IF;
  IF p_kind = 'swap' THEN
    SELECT * INTO c2 FROM public.children WHERE id = p_child_2_id;
    IF c2.id IS NULL THEN RAISE EXCEPTION 'CHILDREN_NOT_FOUND'; END IF;
    IF c1.team_number = c2.team_number THEN RAISE EXCEPTION 'SAME_TEAM'; END IF;
    v_mis := c1.gender IN ('boy','girl') AND c2.gender IN ('boy','girl') AND c1.gender <> c2.gender;
  ELSE
    IF p_target_team IS NULL OR p_target_team <= 0 THEN RAISE EXCEPTION 'INVALID_TEAM'; END IF;
    IF c1.team_number = p_target_team THEN RAISE EXCEPTION 'SAME_TEAM'; END IF;
  END IF;
  IF NOT private.has_role(auth.uid(), 'admin') THEN
    v_my := private.my_team(auth.uid());
    IF v_my IS NULL OR (c1.team_number <> v_my AND COALESCE(c2.team_number, p_target_team) <> v_my) THEN RAISE EXCEPTION 'forbidden_foreign_team_transfer'; END IF;
  END IF;

  IF private.move_needs_approval(v_mis) THEN
    IF EXISTS (SELECT 1 FROM public.transfer_requests WHERE status = 'pending' AND child_1_id = p_child_1_id
               AND child_2_id IS NOT DISTINCT FROM (CASE WHEN p_kind='swap' THEN p_child_2_id END)) THEN
      RETURN jsonb_build_object('status', 'already_pending');
    END IF;
    v_actor := private.actor_label(auth.uid(), p_performed_by);
    v_sum := CASE WHEN p_kind = 'swap'
      THEN c1.full_name || ' (#' || c1.team_number || ') ⇄ ' || c2.full_name || ' (#' || c2.team_number || ')'
      ELSE c1.full_name || ': #' || c1.team_number || ' → #' || p_target_team END;
    INSERT INTO public.transfer_requests(kind, child_1_id, child_2_id, target_team, summary, gender_mismatch, requested_by, requested_label)
    VALUES (p_kind, p_child_1_id, CASE WHEN p_kind='swap' THEN p_child_2_id END, CASE WHEN p_kind='transfer' THEN p_target_team END, v_sum, v_mis, auth.uid(), v_actor)
    RETURNING id INTO v_id;
    INSERT INTO public.notifications(type, title, message, metadata)
    VALUES ('approval', 'Потрібне підтвердження', v_sum || CASE WHEN v_mis THEN ' · різна стать' ELSE '' END,
            jsonb_build_object('request_id', v_id, 'actor', v_actor, 'actor_id', auth.uid()));
    RETURN jsonb_build_object('status', 'pending', 'request_id', v_id);
  END IF;

  IF p_kind = 'swap' THEN PERFORM public.execute_child_swap(p_child_1_id, p_child_2_id, p_performed_by);
  ELSE PERFORM public.execute_child_transfer(p_child_1_id, p_target_team, p_performed_by); END IF;
  RETURN jsonb_build_object('status', 'done');
END; $function$;

CREATE OR REPLACE FUNCTION public.review_transfer_request(p_request_id uuid, p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
DECLARE r public.transfer_requests%ROWTYPE;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.transfer_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status <> 'pending' THEN RETURN jsonb_build_object('status', r.status); END IF;
  IF p_approve THEN
    IF r.kind = 'swap' THEN PERFORM public.execute_child_swap(r.child_1_id, r.child_2_id, COALESCE(r.requested_label, 'Супровід'));
    ELSE PERFORM public.execute_child_transfer(r.child_1_id, r.target_team, COALESCE(r.requested_label, 'Супровід')); END IF;
  END IF;
  UPDATE public.transfer_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_request_id;
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.request_child_move(text, uuid, uuid, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.review_transfer_request(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.request_child_move(text, uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_transfer_request(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.move_needs_approval(boolean) FROM anon, public;

DROP FUNCTION public.search_child_for_transfer(text, uuid, integer);
CREATE FUNCTION public.search_child_for_transfer(p_query text, p_shift_id uuid, p_my_team integer)
 RETURNS TABLE(id uuid, full_name text, team_number integer, gender text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_query IS NULL OR length(btrim(p_query)) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.full_name, c.team_number, c.gender FROM public.children c
  WHERE (p_shift_id IS NULL OR c.shift_id = p_shift_id) AND c.deleted_at IS NULL
    AND c.team_number <> p_my_team AND c.full_name ILIKE '%' || btrim(p_query) || '%'
  ORDER BY c.full_name LIMIT 10;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.search_child_for_transfer(text, uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.search_child_for_transfer(text, uuid, integer) TO authenticated;