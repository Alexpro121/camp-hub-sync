DROP POLICY IF EXISTS "Authenticated manage stage access" ON public.talent_stage_access;
CREATE POLICY "Admins manage stage access" ON public.talent_stage_access FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Read talent media" ON storage.objects;
DROP POLICY IF EXISTS "Upload talent media" ON storage.objects;
DROP POLICY IF EXISTS "Delete talent media" ON storage.objects;

CREATE POLICY "Read talent media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'talent-media' AND (
  private.has_role(auth.uid(), 'admin')
  OR (private.is_staff(auth.uid()) AND (storage.foldername(name))[1] = 'team-' || private.my_team(auth.uid())::text)
  OR (storage.foldername(name))[1] = 'team-' || private.my_child_team(auth.uid())::text
));
CREATE POLICY "Upload talent media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'talent-media' AND (
  private.has_role(auth.uid(), 'admin')
  OR (private.is_staff(auth.uid()) AND (storage.foldername(name))[1] = 'team-' || private.my_team(auth.uid())::text)
  OR (storage.foldername(name))[1] = 'team-' || private.my_child_team(auth.uid())::text
));
CREATE POLICY "Delete talent media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'talent-media' AND (
  private.has_role(auth.uid(), 'admin')
  OR (private.is_staff(auth.uid()) AND (storage.foldername(name))[1] = 'team-' || private.my_team(auth.uid())::text)
  OR (storage.foldername(name))[1] = 'team-' || private.my_child_team(auth.uid())::text
));