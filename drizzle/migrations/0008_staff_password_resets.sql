CREATE TABLE public.staff_password_resets (
  user_id uuid PRIMARY KEY,
  temp_hash text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  changed_at timestamptz
);
REVOKE ALL ON public.staff_password_resets FROM anon, authenticated;
GRANT ALL ON public.staff_password_resets TO service_role;
ALTER TABLE public.staff_password_resets ENABLE ROW LEVEL SECURITY;