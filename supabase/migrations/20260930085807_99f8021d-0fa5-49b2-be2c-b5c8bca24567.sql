DROP POLICY IF EXISTS "Staff and admins can update schedules" ON public.schedules;
CREATE POLICY "Admins can update schedules" ON public.schedules FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Staff and admins can insert schedule items" ON public.schedule_items;
DROP POLICY IF EXISTS "Staff and admins can update schedule items" ON public.schedule_items;
DROP POLICY IF EXISTS "Admins can delete schedule items" ON public.schedule_items;

CREATE POLICY "Admins or own-team staff insert schedule items" ON public.schedule_items FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin')
    OR (private.is_staff(auth.uid()) AND target_teams = jsonb_build_array(private.my_team(auth.uid()))));
CREATE POLICY "Admins or own-team staff update schedule items" ON public.schedule_items FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin')
    OR (private.is_staff(auth.uid()) AND target_teams = jsonb_build_array(private.my_team(auth.uid()))))
  WITH CHECK (private.has_role(auth.uid(),'admin')
    OR (private.is_staff(auth.uid()) AND target_teams = jsonb_build_array(private.my_team(auth.uid()))));
CREATE POLICY "Admins or own-team staff delete schedule items" ON public.schedule_items FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin')
    OR (private.is_staff(auth.uid()) AND target_teams = jsonb_build_array(private.my_team(auth.uid()))));
GRANT DELETE ON public.schedule_items TO authenticated;