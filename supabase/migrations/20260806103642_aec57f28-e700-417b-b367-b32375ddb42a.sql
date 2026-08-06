CREATE OR REPLACE FUNCTION private.my_team(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT team_number
  FROM public.user_roles
  WHERE user_id = _user_id AND role = 'supervisor'::public.app_role
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.my_team(uuid) FROM PUBLIC, anon, authenticated;

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
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR team_number = private.my_team(auth.uid())
);

DROP POLICY IF EXISTS "Staff can delete children" ON public.children;
CREATE POLICY "Admins can delete children"
ON public.children
FOR DELETE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));