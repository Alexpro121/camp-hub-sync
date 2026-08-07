ALTER TABLE public.iron_dollar_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_idt_idempotency_key
  ON public.iron_dollar_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.increment_iron_dollars(
  p_child_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT NULL,
  p_supervisor_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Only admins, or supervisors acting on their own team, may change balances.
  IF NOT (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = v_team)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Replayed offline action: return the current balance without double-crediting.
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.iron_dollar_transactions WHERE idempotency_key = p_idempotency_key
  ) THEN
    SELECT iron_dollars INTO v_new_balance FROM public.children WHERE id = p_child_id;
    RETURN v_new_balance;
  END IF;

  UPDATE public.children
     SET iron_dollars = COALESCE(iron_dollars, 0) + p_amount,
         updated_at = NOW()
   WHERE id = p_child_id
  RETURNING iron_dollars INTO v_new_balance;

  INSERT INTO public.iron_dollar_transactions
    (child_id, supervisor_user_id, amount_change, balance_after, reason, idempotency_key)
  VALUES
    (p_child_id, COALESCE(p_supervisor_id, auth.uid()), p_amount, v_new_balance, p_reason, p_idempotency_key);

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_iron_dollars(UUID, INT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_iron_dollars(UUID, INT, TEXT, UUID, TEXT) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_talent_entries_team ON public.talent_entries (team_number);
CREATE INDEX IF NOT EXISTS idx_schedules_shift_date ON public.schedules (shift_id, date);