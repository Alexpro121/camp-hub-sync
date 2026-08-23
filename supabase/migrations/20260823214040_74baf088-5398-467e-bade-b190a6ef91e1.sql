CREATE OR REPLACE FUNCTION public.pay_fair_push_charge(
  p_child_id uuid,
  p_amount integer,
  p_tx_id text,
  p_supervisor_team integer DEFAULT NULL,
  p_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supervisor_id uuid;
  v_balance integer;
  v_new_balance integer;
  v_team integer;
  v_name text;
BEGIN
  v_supervisor_id := auth.uid();
  IF v_supervisor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT iron_dollars, team_number, full_name
    INTO v_balance, v_team, v_name
  FROM public.children WHERE id = p_child_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'child_not_found';
  END IF;

  -- Будь-який staff або admin може підтвердити Air Pay для дитини будь-якої команди
  IF NOT (
    private.has_role(v_supervisor_id, 'admin')
    OR private.is_staff(v_supervisor_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.iron_dollar_transactions WHERE idempotency_key = 'airpay:' || p_tx_id
  ) THEN
    RETURN jsonb_build_object('status', 'duplicate', 'balance_after', v_balance, 'tx_id', p_tx_id);
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('status', 'insufficient_funds', 'balance', v_balance);
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE public.children
     SET iron_dollars = v_new_balance, updated_at = now()
   WHERE id = p_child_id;

  INSERT INTO public.iron_dollar_transactions
    (child_id, supervisor_user_id, amount_change, balance_after, reason, idempotency_key)
  VALUES
    (p_child_id, v_supervisor_id, -p_amount, v_new_balance,
     COALESCE(NULLIF(p_label, ''), 'Оплата на касі (Air Pay)'), 'airpay:' || p_tx_id);

  RETURN jsonb_build_object('status', 'ok', 'balance_after', v_new_balance, 'tx_id', p_tx_id, 'child_name', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_fair_push_charge(uuid, integer, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_fair_push_charge(uuid, integer, text, integer, text) TO service_role;