ALTER TABLE public.iron_dollar_transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iron_dollar_transactions;