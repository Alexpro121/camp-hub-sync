-- 1. Private schema for security-definer helpers (not exposed to the Data API)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')); $$;

CREATE OR REPLACE FUNCTION private.my_child_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT child_id FROM public.user_roles WHERE user_id = _user_id AND role = 'child' LIMIT 1; $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.my_child_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.my_child_id(uuid) TO authenticated, service_role;

-- 2. Repoint all policies to the private helpers
DROP POLICY IF EXISTS "Staff can read children" ON public.children;
DROP POLICY IF EXISTS "Staff can insert children" ON public.children;
DROP POLICY IF EXISTS "Staff can update children" ON public.children;
DROP POLICY IF EXISTS "Staff can delete children" ON public.children;
DROP POLICY IF EXISTS "Child can read own record" ON public.children;
CREATE POLICY "Staff can read children" ON public.children FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Staff can insert children" ON public.children FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "Staff can update children" ON public.children FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "Staff can delete children" ON public.children FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Child can read own record" ON public.children FOR SELECT TO authenticated USING (id = private.my_child_id(auth.uid()));

DROP POLICY IF EXISTS "Staff can read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Staff can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can delete notifications" ON public.notifications;
CREATE POLICY "Staff can read notifications" ON public.notifications FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Staff can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "Admins can delete notifications" ON public.notifications FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff can read transfers" ON public.transfers;
DROP POLICY IF EXISTS "Staff can insert transfers" ON public.transfers;
DROP POLICY IF EXISTS "Admins can delete transfers" ON public.transfers;
CREATE POLICY "Staff can read transfers" ON public.transfers FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Staff can insert transfers" ON public.transfers FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "Admins can delete transfers" ON public.transfers FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff can read files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Admins can insert files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Admins can delete files" ON public.uploaded_files;
CREATE POLICY "Staff can read files" ON public.uploaded_files FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Admins can insert files" ON public.uploaded_files FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete files" ON public.uploaded_files FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- 3. Shifts: staff-only read instead of all authenticated users
DROP POLICY IF EXISTS "Authenticated can read shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins can insert shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins can update shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins can delete shifts" ON public.shifts;
CREATE POLICY "Staff can read shifts" ON public.shifts FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Admins can insert shifts" ON public.shifts FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update shifts" ON public.shifts FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete shifts" ON public.shifts FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- 4. user_roles: explicit admin-only write path
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- 5. Drop the publicly-callable definer functions
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);
DROP FUNCTION IF EXISTS public.my_child_id(uuid);