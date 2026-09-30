DROP POLICY IF EXISTS "Admins can insert schedules" ON public.schedules;
CREATE POLICY "Staff and admins can insert schedules" ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Admins can update schedules" ON public.schedules;
CREATE POLICY "Staff and admins can update schedules" ON public.schedules FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.is_staff(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Admins can insert schedule items" ON public.schedule_items;
CREATE POLICY "Staff and admins can insert schedule items" ON public.schedule_items FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Admins can update schedule items" ON public.schedule_items;
CREATE POLICY "Staff and admins can update schedule items" ON public.schedule_items FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.is_staff(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.schedules, public.schedule_items TO authenticated;