CREATE TABLE public.alumni_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'alumni_announcement',
  title text NOT NULL,
  prize text,
  message text,
  target_year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
GRANT SELECT ON public.alumni_broadcasts TO anon, authenticated;
GRANT INSERT, DELETE ON public.alumni_broadcasts TO authenticated;
GRANT ALL ON public.alumni_broadcasts TO service_role;
ALTER TABLE public.alumni_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active alumni broadcasts" ON public.alumni_broadcasts
  FOR SELECT TO anon, authenticated USING (expires_at > now());
CREATE POLICY "Admins read all alumni broadcasts" ON public.alumni_broadcasts
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins send alumni broadcasts" ON public.alumni_broadcasts
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin') AND kind IN ('alumni_raffle','alumni_announcement') AND length(title) BETWEEN 1 AND 200 AND coalesce(length(message),0) <= 2000);
CREATE POLICY "Admins delete alumni broadcasts" ON public.alumni_broadcasts
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE INDEX alumni_broadcasts_created_idx ON public.alumni_broadcasts (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.alumni_broadcasts;