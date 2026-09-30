ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'supervisor',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS registered_via uuid;
ALTER TABLE public.staff_members DROP CONSTRAINT IF EXISTS staff_members_kind_check;
ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_kind_check CHECK (kind IN ('supervisor','duckling'));

CREATE TABLE public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  label text,
  kind text NOT NULL DEFAULT 'supervisor' CHECK (kind IN ('supervisor','duckling')),
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_invites TO authenticated;
GRANT ALL ON public.staff_invites TO service_role;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read invites" ON public.staff_invites FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'));