DROP POLICY IF EXISTS "Staff can read children" ON public.children;

CREATE POLICY "Admins can read all children" ON public.children
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisors can read own team children" ON public.children
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'supervisor') AND
    team_number = private.my_team(auth.uid())
  );