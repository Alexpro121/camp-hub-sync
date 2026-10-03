REVOKE ALL ON public.staff_invites FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.staff_invites FROM authenticated;
GRANT SELECT ON public.staff_invites TO authenticated;
GRANT ALL ON public.staff_invites TO service_role;
DROP POLICY IF EXISTS "Admins read invites" ON public.staff_invites;
DROP POLICY IF EXISTS "admin_invites" ON public.staff_invites;
CREATE POLICY "admin_invites" ON public.staff_invites FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));