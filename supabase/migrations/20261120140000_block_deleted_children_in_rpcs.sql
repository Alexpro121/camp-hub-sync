-- Видалений на стійці учасник (deleted_at) не можна переводити, обмінювати
-- чи змінювати йому залізні долари навіть прямим викликом RPC.
-- Визначення ідентичні поточним; додано лише умову deleted_at IS NULL при пошуку дитини.

CREATE OR REPLACE FUNCTION public.execute_child_swap(p_child_1_id uuid, p_child_2_id uuid, p_performed_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE v_team_1 int; v_team_2 int; v_name_1 text; v_name_2 text; v_g1 text; v_g2 text; v_my_team int; v_actor text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_child_1_id = p_child_2_id THEN RAISE EXCEPTION 'SAME_CHILD'; END IF;
  SELECT c.team_number, c.full_name, c.gender INTO v_team_1, v_name_1, v_g1 FROM public.children c WHERE c.id = p_child_1_id AND c.deleted_at IS NULL FOR UPDATE;
  SELECT c.team_number, c.full_name, c.gender INTO v_team_2, v_name_2, v_g2 FROM public.children c WHERE c.id = p_child_2_id AND c.deleted_at IS NULL FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.execute_child_transfer(p_child_id uuid, p_target_team integer, p_performed_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE v_old_team int; v_child_name text; v_my_team int; v_actor text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_target_team IS NULL OR p_target_team <= 0 THEN RAISE EXCEPTION 'INVALID_TEAM'; END IF;
  SELECT c.team_number, c.full_name INTO v_old_team, v_child_name FROM public.children c WHERE c.id = p_child_id AND c.deleted_at IS NULL FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.increment_iron_dollars(p_child_id uuid, p_amount integer, p_reason text DEFAULT NULL::text, p_supervisor_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance INT;
  v_team INT;
  v_balance INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT team_number, COALESCE(iron_dollars, 0) INTO v_team, v_balance
  FROM public.children WHERE id = p_child_id AND deleted_at IS NULL FOR UPDATE;
  IF v_team IS NULL THEN RAISE EXCEPTION 'child_not_found'; END IF;
  IF NOT (private.has_role(auth.uid(), 'admin') OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = v_team)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM public.iron_dollar_transactions WHERE idempotency_key = p_idempotency_key) THEN RETURN v_balance; END IF;
  IF p_amount < 0 AND (v_balance + p_amount) < 0 THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  BEGIN
    INSERT INTO public.iron_dollar_transactions (child_id, supervisor_user_id, amount_change, balance_after, reason, idempotency_key)
    VALUES (p_child_id, auth.uid(), p_amount, NULL, p_reason, p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN RETURN v_balance;
  END;
  UPDATE public.children SET iron_dollars = COALESCE(iron_dollars, 0) + p_amount, updated_at = NOW()
  WHERE id = p_child_id RETURNING iron_dollars INTO v_new_balance;
  UPDATE public.iron_dollar_transactions SET balance_after = v_new_balance
  WHERE child_id = p_child_id AND balance_after IS NULL AND (p_idempotency_key IS NULL OR idempotency_key = p_idempotency_key);
  RETURN v_new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_child_move(p_kind text, p_child_1_id uuid, p_child_2_id uuid, p_target_team integer, p_performed_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE c1 public.children%ROWTYPE; c2 public.children%ROWTYPE; v_my int; v_mis boolean := false; v_id uuid; v_sum text; v_actor text;
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_kind NOT IN ('transfer','swap') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
  SELECT * INTO c1 FROM public.children WHERE id = p_child_1_id AND deleted_at IS NULL;
  IF c1.id IS NULL THEN RAISE EXCEPTION 'CHILD_NOT_FOUND'; END IF;
  IF p_kind = 'swap' THEN
    SELECT * INTO c2 FROM public.children WHERE id = p_child_2_id AND deleted_at IS NULL;
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
