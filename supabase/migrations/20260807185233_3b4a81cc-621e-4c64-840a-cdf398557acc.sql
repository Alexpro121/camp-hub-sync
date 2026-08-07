CREATE INDEX IF NOT EXISTS idx_iron_trans_supervisor ON public.iron_dollar_transactions(supervisor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iron_trans_child ON public.iron_dollar_transactions(child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fair_payments_supervisor ON public.fair_payments(supervisor_user_id, created_at DESC);