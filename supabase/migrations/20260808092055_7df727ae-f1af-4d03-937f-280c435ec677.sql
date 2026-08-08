CREATE TABLE IF NOT EXISTS public.fair_preset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0 AND amount <= 10000),
  is_reusable BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fair_preset_codes TO authenticated;
GRANT ALL ON public.fair_preset_codes TO service_role;

ALTER TABLE public.fair_preset_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage fair preset codes"
  ON public.fair_preset_codes FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read fair preset codes"
  ON public.fair_preset_codes FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.fair_payments ADD COLUMN IF NOT EXISTS preset_code_id UUID;
ALTER TABLE public.fair_payments ADD COLUMN IF NOT EXISTS label TEXT;

CREATE INDEX IF NOT EXISTS fair_payments_child_preset_idx
  ON public.fair_payments (child_id, preset_code_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.pay_fair_purchase(
  p_tx_id uuid,
  p_amount integer,
  p_supervisor_id uuid DEFAULT NULL::uuid,
  p_supervisor_team integer DEFAULT NULL::integer,
  p_code_id uuid DEFAULT NULL::uuid,
  p_label text DEFAULT NULL::text
)
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

  v_child_id := private.my_child_id(auth.uid());
  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'not_a_child';
  END IF;

  -- Printed price tag: the server decides amount/label, never the QR content.
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
    -- Reusable tags are not tx-unique; only guard against a double scan burst.
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

REVOKE ALL ON FUNCTION public.pay_fair_purchase(uuid, integer, uuid, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_fair_purchase(uuid, integer, uuid, integer, uuid, text) TO authenticated;