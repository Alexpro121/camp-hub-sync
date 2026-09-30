CREATE OR REPLACE FUNCTION public.shift_schedule_items(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.schedule_items si
     SET time_start = r->>'time_start', time_end = r->>'time_end',
         sub_slots = COALESCE(r->'sub_slots', '[]'::jsonb), updated_at = now()
    FROM jsonb_array_elements(p_items) r
   WHERE si.id = (r->>'id')::uuid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> jsonb_array_length(p_items) THEN RAISE EXCEPTION 'shift_incomplete'; END IF;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.shift_schedule_items(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_schedule_items(jsonb) TO authenticated;

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
  ELSE
    INSERT INTO public.notifications(type, title, message, metadata)
    VALUES ('transfer_rejected', 'Адмін відхилив переведення', r.summary,
            jsonb_build_object('request_id', r.id, 'requested_by', r.requested_by, 'actor', 'Адмін', 'actor_id', auth.uid()));
  END IF;
  UPDATE public.transfer_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_request_id;
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_available_transfer_teams(p_shift_id uuid, p_my_team integer)
 RETURNS TABLE(team_number integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY';
  END IF;
  RETURN QUERY
  SELECT t FROM (
    SELECT c.team_number AS t FROM public.children c
     WHERE (p_shift_id IS NULL OR c.shift_id = p_shift_id) AND c.deleted_at IS NULL
    UNION
    SELECT unnest(s.assigned_teams)::int FROM public.shifts s
     WHERE p_shift_id IS NOT NULL AND s.id = p_shift_id
  ) x WHERE t IS NOT NULL AND t > 0 AND t <> p_my_team
  ORDER BY 1;
END;
$function$;