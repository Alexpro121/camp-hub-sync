CREATE POLICY talent_system_disabled ON public.talent_events AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY talent_system_disabled ON public.talent_entries AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY talent_system_disabled ON public.talent_stage_access AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.talent_events, public.talent_entries, public.talent_stage_access FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_talent_order(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_stage_console_data(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_stage_password(uuid,text) FROM PUBLIC, anon, authenticated;
CREATE POLICY talent_media_disabled ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (bucket_id <> 'talent-media') WITH CHECK (bucket_id <> 'talent-media');