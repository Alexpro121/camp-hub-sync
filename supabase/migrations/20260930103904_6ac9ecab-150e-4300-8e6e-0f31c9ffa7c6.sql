CREATE OR REPLACE FUNCTION public.execute_coupe_swap(p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_req public.coupe_swap_requests%ROWTYPE;
  v_req_seat INT;
  v_req_coupe INT;
  v_child UUID;
  v_is_staff BOOLEAN;
  v_auto BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_req FROM public.coupe_swap_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_req.status = 'rejected' THEN RETURN FALSE; END IF;

  v_child := private.my_child_id(auth.uid());
  v_is_staff := private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = v_req.team_number);

  IF NOT (v_is_staff OR v_child IN (v_req.requester_child_id, v_req.target_child_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(auto_approve_swaps, FALSE) INTO v_auto FROM public.shifts WHERE id = v_req.shift_id;
  v_auto := COALESCE(v_auto, FALSE);

  IF v_req.status <> 'approved'
     AND NOT v_is_staff
     AND NOT v_auto
     AND v_child IS NOT DISTINCT FROM v_req.requester_child_id
     AND v_child IS DISTINCT FROM v_req.target_child_id THEN
    RAISE EXCEPTION 'awaiting_target_consent';
  END IF;

  IF v_req.status = 'approved' THEN RETURN TRUE; END IF;

  -- Serialise swaps per team/trip so two concurrent swaps cannot collide.
  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(v_req.shift_id::text, '') || ':' || v_req.team_number || ':' || v_req.trip_number));

  SELECT seat_number, coupe_number INTO v_req_seat, v_req_coupe
  FROM public.train_coupes
  WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number
  LIMIT 1;

  IF v_req_seat IS NULL THEN RETURN FALSE; END IF;

  IF v_req.target_child_id IS NOT NULL THEN
    -- Temporary NULL seat is excluded from the partial unique index (unlike -1).
    UPDATE public.train_coupes SET seat_number = NULL
     WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;
    UPDATE public.train_coupes SET seat_number = v_req_seat, coupe_number = v_req_coupe
     WHERE child_id = v_req.target_child_id AND trip_number = v_req.trip_number;
  END IF;
  UPDATE public.train_coupes SET seat_number = v_req.target_seat_number, coupe_number = v_req.target_coupe_number
   WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;

  UPDATE public.coupe_swap_requests SET status = 'approved' WHERE id = p_request_id;
  RETURN TRUE;
END;
$function$;

-- Repair any seats left at -1 by the old implementation.
UPDATE public.train_coupes SET seat_number = NULL WHERE seat_number = -1;