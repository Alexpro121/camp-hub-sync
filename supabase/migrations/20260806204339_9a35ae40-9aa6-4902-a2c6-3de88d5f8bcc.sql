DROP POLICY IF EXISTS "Staff can update children" ON public.children;

CREATE POLICY "Staff can update children"
ON public.children
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
);