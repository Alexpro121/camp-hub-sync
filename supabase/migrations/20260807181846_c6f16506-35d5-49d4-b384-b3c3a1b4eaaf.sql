CREATE OR REPLACE FUNCTION public.increment_iron_dollars(p_child_id uuid, p_amount integer, p_reason text DEFAULT NULL::text, p_supervisor_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance INT;
  v_team INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT team_number INTO v_team FROM public.children WHERE id = p_child_id;
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
    SELECT iron_dollars INTO v_new_balance FROM public.children WHERE id = p_child_id;
    RETURN v_new_balance;
  END IF;

  -- Claim the idempotency key FIRST; concurrent replays lose the race here.
  BEGIN
    INSERT INTO public.iron_dollar_transactions
      (child_id, supervisor_user_id, amount_change, balance_after, reason, idempotency_key)
    VALUES
      (p_child_id, COALESCE(p_supervisor_id, auth.uid()), p_amount, NULL, p_reason, p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN
    SELECT iron_dollars INTO v_new_balance FROM public.children WHERE id = p_child_id;
    RETURN v_new_balance;
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