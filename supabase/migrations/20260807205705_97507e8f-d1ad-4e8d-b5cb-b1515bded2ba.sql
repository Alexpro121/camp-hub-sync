CREATE TABLE public.fair_short_codes (
  code TEXT PRIMARY KEY,
  supervisor_user_id UUID,
  supervisor_team INTEGER,
  amount INTEGER NOT NULL,
  tx_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fair_short_codes TO authenticated;
GRANT ALL ON public.fair_short_codes TO service_role;

ALTER TABLE public.fair_short_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can resolve active codes"
ON public.fair_short_codes FOR SELECT TO authenticated
USING (expires_at > now());

CREATE POLICY "Staff manage their own codes"
ON public.fair_short_codes FOR INSERT TO authenticated
WITH CHECK (supervisor_user_id = auth.uid());

CREATE POLICY "Staff update their own codes"
ON public.fair_short_codes FOR UPDATE TO authenticated
USING (supervisor_user_id = auth.uid())
WITH CHECK (supervisor_user_id = auth.uid());

CREATE POLICY "Staff delete their own codes"
ON public.fair_short_codes FOR DELETE TO authenticated
USING (supervisor_user_id = auth.uid());

CREATE INDEX idx_fair_short_codes_expires ON public.fair_short_codes(expires_at);