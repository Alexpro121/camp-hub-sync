DROP POLICY IF EXISTS "Staff can update children" ON public.children;
CREATE POLICY "Staff can update children"
ON public.children
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR team_number = private.my_team(auth.uid())
)
WITH CHECK (
  private.is_staff(auth.uid())
);