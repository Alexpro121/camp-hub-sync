-- 1. Manual fair override switch
ALTER TABLE public.fair_settings ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- 2. [C-2] Fair window enforcement (Europe/Kyiv) inside pay_fair_purchase
CREATE OR REPLACE FUNCTION public.is_fair_open_now()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.fair_settings WHERE is_active)
      OR EXISTS (
        SELECT 1
        FROM public.schedule_items si
        JOIN public.schedules s ON s.id = si.schedule_id
        WHERE s.is_published
          AND s.deleted_at IS NULL
          AND s.date = (now() AT TIME ZONE 'Europe/Kyiv')::date
          AND si.category = 'fair'
          AND si.time_start ~ '^[0-9]{1,2}:[0-9]{2}$'
          AND si.time_end   ~ '^[0-9]{1,2}:[0-9]{2}$'
          AND (now() AT TIME ZONE 'Europe/Kyiv')::time
              BETWEEN si.time_start::time AND si.time_end::time
      );
$$;

REVOKE ALL ON FUNCTION public.is_fair_open_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_fair_open_now() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pay_fair_purchase(p_tx_id uuid, p_amount integer, p_supervisor_id uuid DEFAULT NULL::uuid, p_supervisor_team integer DEFAULT NULL::integer, p_code_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_child_id uuid;
  v_name text;
  v_team integer;
  v_balance integer;
  v_new_balance integer;
  v_existing public.fair_payments%ROWTYPE;
  v_allow boolean;
  v_preset public.fair_preset_codes%ROWTYPE;
  v_reusable boolean := false;
  v_tx uuid := p_tx_id;
  v_label text := p_label;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- [C-2] Server-side fair window: admins bypass, everyone else needs an open fair.
  IF NOT private.has_role(auth.uid(), 'admin') AND NOT public.is_fair_open_now() THEN
    RAISE EXCEPTION 'fair_closed';
  END IF;

  v_child_id := private.my_child_id(auth.uid());
  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'not_a_child';
  END IF;

  IF p_code_id IS NOT NULL THEN
    SELECT * INTO v_preset FROM public.fair_preset_codes WHERE id = p_code_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'unknown_preset';
    END IF;
    v_reusable := COALESCE(v_preset.is_reusable, false);
    p_amount := v_preset.amount;
    v_label := v_preset.label;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF v_reusable THEN
    IF EXISTS (
      SELECT 1 FROM public.fair_payments
      WHERE child_id = v_child_id
        AND preset_code_id = p_code_id
        AND created_at > now() - interval '5 seconds'
    ) THEN
      RAISE EXCEPTION 'double_scan_guard';
    END IF;
    v_tx := gen_random_uuid();
  ELSE
    SELECT * INTO v_existing FROM public.fair_payments WHERE tx_id = p_tx_id;
    IF FOUND THEN
      IF v_existing.child_id <> v_child_id THEN
        RAISE EXCEPTION 'tx_already_used';
      END IF;
      RETURN jsonb_build_object('status', 'duplicate', 'amount', v_existing.amount, 'balance_after', v_existing.balance_after, 'label', v_existing.label);
    END IF;
  END IF;

  SELECT full_name, team_number, COALESCE(iron_dollars, 0)
    INTO v_name, v_team, v_balance
  FROM public.children WHERE id = v_child_id FOR UPDATE;

  IF p_supervisor_team IS NOT NULL AND v_team IS DISTINCT FROM p_supervisor_team THEN
    v_allow := FALSE;
    IF p_supervisor_id IS NOT NULL THEN
      SELECT allow_other_teams INTO v_allow FROM public.fair_settings WHERE supervisor_user_id = p_supervisor_id;
    END IF;
    IF NOT COALESCE(v_allow, FALSE) THEN
      RAISE EXCEPTION 'RESTRICTED_TEAM_PAYMENT:%', p_supervisor_team;
    END IF;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('status', 'insufficient_funds', 'balance', v_balance, 'amount', p_amount);
  END IF;

  BEGIN
    INSERT INTO public.fair_payments (tx_id, child_id, child_name, team_number, supervisor_user_id, supervisor_team, amount, preset_code_id, label)
    VALUES (v_tx, v_child_id, v_name, v_team, p_supervisor_id, p_supervisor_team, p_amount, p_code_id, v_label);
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.fair_payments WHERE tx_id = v_tx;
    RETURN jsonb_build_object('status', 'duplicate', 'amount', v_existing.amount, 'balance_after', v_existing.balance_after, 'label', v_existing.label);
  END;

  UPDATE public.children
     SET iron_dollars = COALESCE(iron_dollars, 0) - p_amount,
         updated_at = now()
   WHERE id = v_child_id
  RETURNING iron_dollars INTO v_new_balance;

  UPDATE public.fair_payments SET balance_after = v_new_balance WHERE tx_id = v_tx;

  INSERT INTO public.iron_dollar_transactions
    (child_id, supervisor_user_id, amount_change, balance_after, reason, idempotency_key)
  VALUES
    (v_child_id, p_supervisor_id, -p_amount, v_new_balance,
     COALESCE(NULLIF(v_label, ''), 'Ярмарок') || ' (Ярмарок, Команда №' || v_team::text || ')', 'fair:' || v_tx::text);

  RETURN jsonb_build_object('status', 'ok', 'amount', p_amount, 'balance_after', v_new_balance, 'label', v_label, 'tx_id', v_tx);
END;
$function$;

-- 3. [C-3] Consent-aware coupe swap
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

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

  -- The requester alone may never finalise a pending swap.
  IF v_req.status <> 'approved'
     AND NOT v_is_staff
     AND NOT v_auto
     AND v_child IS NOT DISTINCT FROM v_req.requester_child_id
     AND v_child IS DISTINCT FROM v_req.target_child_id THEN
    RAISE EXCEPTION 'awaiting_target_consent';
  END IF;

  IF v_req.status = 'approved' THEN RETURN TRUE; END IF;

  SELECT seat_number, coupe_number INTO v_req_seat, v_req_coupe
  FROM public.train_coupes
  WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number
  LIMIT 1;

  IF v_req_seat IS NULL THEN RETURN FALSE; END IF;

  IF v_req.target_child_id IS NOT NULL THEN
    UPDATE public.train_coupes
       SET seat_number = -1, coupe_number = -1
     WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;

    UPDATE public.train_coupes
       SET seat_number = v_req_seat, coupe_number = v_req_coupe
     WHERE child_id = v_req.target_child_id AND trip_number = v_req.trip_number;

    UPDATE public.train_coupes
       SET seat_number = v_req.target_seat_number, coupe_number = v_req.target_coupe_number
     WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;
  ELSE
    UPDATE public.train_coupes
       SET seat_number = v_req.target_seat_number, coupe_number = v_req.target_coupe_number
     WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;
  END IF;

  UPDATE public.coupe_swap_requests SET status = 'approved' WHERE id = p_request_id;
  RETURN TRUE;
END;
$function$;

-- 4. [H-4] No negative Iron Dollar balances
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT team_number, COALESCE(iron_dollars, 0) INTO v_team, v_balance
  FROM public.children WHERE id = p_child_id FOR UPDATE;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'child_not_found';
  END IF;

  IF NOT (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = v_team)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.iron_dollar_transactions WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN v_balance;
  END IF;

  IF p_amount < 0 AND (v_balance + p_amount) < 0 THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  BEGIN
    INSERT INTO public.iron_dollar_transactions
      (child_id, supervisor_user_id, amount_change, balance_after, reason, idempotency_key)
    VALUES
      (p_child_id, COALESCE(p_supervisor_id, auth.uid()), p_amount, NULL, p_reason, p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN
    RETURN v_balance;
  END;

  UPDATE public.children
     SET iron_dollars = COALESCE(iron_dollars, 0) + p_amount,
         updated_at = NOW()
   WHERE id = p_child_id
  RETURNING iron_dollars INTO v_new_balance;

  UPDATE public.iron_dollar_transactions
     SET balance_after = v_new_balance
   WHERE child_id = p_child_id
     AND balance_after IS NULL
     AND (p_idempotency_key IS NULL OR idempotency_key = p_idempotency_key);

  RETURN v_new_balance;
END;
$function$;

-- 5. [M-2] Transfers limited to the supervisor's own team
CREATE OR REPLACE FUNCTION public.execute_child_transfer(p_child_id uuid, p_target_team integer, p_performed_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_old_team int;
  v_child_name text;
  v_my_team int;
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

  IF NOT private.has_role(auth.uid(), 'admin') THEN
    v_my_team := private.my_team(auth.uid());
    IF v_my_team IS NULL OR (v_old_team <> v_my_team AND p_target_team <> v_my_team) THEN
      RAISE EXCEPTION 'forbidden_foreign_team_transfer';
    END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.execute_child_swap(p_child_1_id uuid, p_child_2_id uuid, p_performed_by text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_team_1 int; v_team_2 int; v_name_1 text; v_name_2 text; v_my_team int;
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

  IF NOT private.has_role(auth.uid(), 'admin') THEN
    v_my_team := private.my_team(auth.uid());
    IF v_my_team IS NULL OR (v_team_1 <> v_my_team AND v_team_2 <> v_my_team) THEN
      RAISE EXCEPTION 'forbidden_foreign_team_transfer';
    END IF;
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
$function$;

-- 6. [M-3] Single strict UPDATE policy on children
DROP POLICY IF EXISTS "Admins can update children" ON public.children;
DROP POLICY IF EXISTS "Supervisors can update own team children" ON public.children;
DROP POLICY IF EXISTS "Supervisors update own team children" ON public.children;

CREATE POLICY "Supervisors update own team children"
ON public.children
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NULL AND (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) IS NOT NULL AND team_number = private.my_team(auth.uid()))
  )
)
WITH CHECK (
  deleted_at IS NULL AND (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) IS NOT NULL AND team_number = private.my_team(auth.uid()))
  )
);

-- 7. [L-3] Auto-cleanup of expired short codes
CREATE OR REPLACE FUNCTION public.purge_expired_fair_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.fair_short_codes WHERE expires_at < (now() - interval '1 hour');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS purge_expired_fair_codes ON public.fair_short_codes;
CREATE TRIGGER purge_expired_fair_codes
AFTER INSERT ON public.fair_short_codes
FOR EACH STATEMENT EXECUTE FUNCTION public.purge_expired_fair_codes();