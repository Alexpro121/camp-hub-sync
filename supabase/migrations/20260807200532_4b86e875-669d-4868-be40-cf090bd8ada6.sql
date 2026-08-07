CREATE TABLE IF NOT EXISTS public.fair_settings (
  supervisor_user_id UUID PRIMARY KEY,
  team_number INTEGER,
  allow_other_teams BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fair_settings TO authenticated;
GRANT ALL ON public.fair_settings TO service_role;
ALTER TABLE public.fair_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage own fair settings" ON public.fair_settings;
CREATE POLICY "Staff manage own fair settings" ON public.fair_settings
  FOR ALL TO authenticated
  USING (supervisor_user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (supervisor_user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_fair_settings_updated_at ON public.fair_settings;
CREATE TRIGGER update_fair_settings_updated_at BEFORE UPDATE ON public.fair_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.children REPLICA IDENTITY FULL;
ALTER TABLE public.train_coupes REPLICA IDENTITY FULL;
ALTER TABLE public.fair_settings REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.children; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.train_coupes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.fair_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

CREATE OR REPLACE FUNCTION public.pay_fair_purchase(p_tx_id uuid, p_amount integer, p_supervisor_id uuid DEFAULT NULL::uuid, p_supervisor_team integer DEFAULT NULL::integer)
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

  -- Team access control: by default a supervisor only serves their own team.
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
$function$;