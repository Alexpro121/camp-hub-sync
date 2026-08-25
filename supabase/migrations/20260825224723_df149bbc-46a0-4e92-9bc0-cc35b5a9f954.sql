CREATE TABLE IF NOT EXISTS public.team_passwords (
  team INTEGER PRIMARY KEY,
  password TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON public.team_passwords TO service_role;
ALTER TABLE public.team_passwords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role manages team_passwords" ON public.team_passwords FOR ALL TO service_role USING (true) WITH CHECK (true);