GRANT ALL ON TABLE public.team_passwords TO service_role;

DROP POLICY IF EXISTS "Service role manages team passwords" ON public.team_passwords;
CREATE POLICY "Service role manages team passwords"
ON public.team_passwords
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);