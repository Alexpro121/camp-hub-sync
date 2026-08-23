CREATE POLICY "Everyone reads published talent program"
ON public.talent_entries FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.talent_events te
  WHERE te.id = talent_entries.event_id
    AND te.status = ANY (ARRAY['generated'::text, 'finished'::text])
));