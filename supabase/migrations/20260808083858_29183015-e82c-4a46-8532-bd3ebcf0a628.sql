-- iron_dollar_transactions: team scoping for staff
DROP POLICY IF EXISTS "Staff can read transactions" ON public.iron_dollar_transactions;
CREATE POLICY "Staff can read own team transactions"
ON public.iron_dollar_transactions FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR (
    private.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = iron_dollar_transactions.child_id
        AND c.team_number = private.my_team(auth.uid())
    )
  )
);

-- talent_entries: team scoping for staff
DROP POLICY IF EXISTS "Staff read all talent entries" ON public.talent_entries;
CREATE POLICY "Staff read own team talent entries"
ON public.talent_entries FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
);

-- train_coupes: team scoping for staff
DROP POLICY IF EXISTS "Staff can read train coupes" ON public.train_coupes;
CREATE POLICY "Staff can read own team coupes"
ON public.train_coupes FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
);

-- fair_short_codes: remove open lookup
DROP POLICY IF EXISTS "Signed-in users can resolve active codes" ON public.fair_short_codes;
CREATE POLICY "Staff read their own codes"
ON public.fair_short_codes FOR SELECT TO authenticated
USING (supervisor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.resolve_fair_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v public.fair_short_codes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_code IS NULL OR p_code !~ '^[0-9]{4,8}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v FROM public.fair_short_codes
   WHERE code = p_code AND expires_at > now();
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'tx_id', v.tx_id,
    'amount', v.amount,
    'supervisor_user_id', v.supervisor_user_id,
    'supervisor_team', v.supervisor_team,
    'expires_at', v.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_fair_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_fair_code(text) TO authenticated;