ALTER TABLE public.iron_dollar_transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'iron_dollar_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.iron_dollar_transactions;
  END IF;
END $$;