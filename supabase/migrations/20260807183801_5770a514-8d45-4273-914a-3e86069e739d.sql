CREATE TABLE public.fair_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_id uuid NOT NULL UNIQUE,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  child_name text NOT NULL,
  team_number integer NOT NULL,
  supervisor_user_id uuid,
  supervisor_team integer,
  amount integer NOT NULL,
  balance_after integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fair_payments TO authenticated;
GRANT ALL ON public.fair_payments TO service_role;

ALTER TABLE public.fair_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all fair payments"
ON public.fair_payments FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors read own team fair payments"
ON public.fair_payments FOR SELECT TO authenticated
USING (private.my_team(auth.uid()) IS NOT NULL AND private.my_team(auth.uid()) = team_number);

CREATE POLICY "Children read own fair payments"
ON public.fair_payments FOR SELECT TO authenticated
USING (child_id = private.my_child_id(auth.uid()));

CREATE INDEX idx_fair_payments_team_created ON public.fair_payments (team_number, created_at DESC);
CREATE INDEX idx_fair_payments_child ON public.fair_payments (child_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.fair_payments;

CREATE OR REPLACE FUNCTION public.pay_fair_purchase(
  p_tx_id uuid,
  p_amount integer,
  p_supervisor_id uuid DEFAULT NULL,
  p_supervisor_team integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_child_id uuid;
  v_name text;
  v_team integer;
  v_balance integer;
  v_new_balance integer;
  v_existing public.fair_payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_child_id := private.my_child_id(auth.uid());
  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'not_a_child';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Replay of the same QR transaction returns the original result.
  SELECT * INTO v_existing FROM public.fair_payments WHERE tx_id = p_tx_id;
  IF FOUND THEN
    IF v_existing.child_id <> v_child_id THEN
      RAISE EXCEPTION 'tx_already_used';
    END IF;
    RETURN jsonb_build_object('status', 'duplicate', 'amount', v_existing.amount, 'balance_after', v_existing.balance_after);
  END IF;

  SELECT full_name, team_number, COALESCE(iron_dollars, 0)
    INTO v_name, v_team, v_balance
  FROM public.children WHERE id = v_child_id FOR UPDATE;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('status', 'insufficient_funds', 'balance', v_balance, 'amount', p_amount);
  END IF;

  BEGIN
    INSERT INTO public.fair_payments (tx_id, child_id, child_name, team_number, supervisor_user_id, supervisor_team, amount)
    VALUES (p_tx_id, v_child_id, v_name, v_team, p_supervisor_id, p_supervisor_team, p_amount);
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.fair_payments WHERE tx_id = p_tx_id;
    RETURN jsonb_build_object('status', 'duplicate', 'amount', v_existing.amount, 'balance_after', v_existing.balance_after);
  END;

  UPDATE public.children
     SET iron_dollars = COALESCE(iron_dollars, 0) - p_amount,
         updated_at = now()
   WHERE id = v_child_id
  RETURNING iron_dollars INTO v_new_balance;

  UPDATE public.fair_payments SET balance_after = v_new_balance WHERE tx_id = p_tx_id;

  INSERT INTO public.iron_dollar_transactions
    (child_id, supervisor_user_id, amount_change, balance_after, reason, idempotency_key)
  VALUES
    (v_child_id, p_supervisor_id, -p_amount, v_new_balance, 'Ярмарок', 'fair:' || p_tx_id::text);

  RETURN jsonb_build_object('status', 'ok', 'amount', p_amount, 'balance_after', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_fair_purchase(uuid, integer, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_fair_purchase(uuid, integer, uuid, integer) TO authenticated;