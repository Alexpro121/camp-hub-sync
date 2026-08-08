DROP POLICY IF EXISTS "Supervisors can read own team children" ON public.children;
DROP POLICY IF EXISTS "Admins can read all children" ON public.children;
DROP POLICY IF EXISTS "Staff can read children" ON public.children;
DROP POLICY IF EXISTS "Staff can read all children" ON public.children;
CREATE POLICY "Staff can read all children" ON public.children
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update children" ON public.children;
DROP POLICY IF EXISTS "Supervisors can update own team children" ON public.children;
CREATE POLICY "Supervisors can update own team children" ON public.children
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin') OR
    (private.has_role(auth.uid(), 'supervisor') AND team_number = private.my_team(auth.uid()))
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin') OR
    (private.has_role(auth.uid(), 'supervisor') AND team_number = private.my_team(auth.uid()))
  );