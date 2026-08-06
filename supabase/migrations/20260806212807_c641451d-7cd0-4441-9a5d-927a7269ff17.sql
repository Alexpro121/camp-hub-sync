CREATE TABLE IF NOT EXISTS public.train_coupes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  team_number INT NOT NULL,
  coupe_number INT NOT NULL,
  seat_number INT,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  passenger_name TEXT NOT NULL,
  boarding_city TEXT DEFAULT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_train_coupes_child ON public.train_coupes(child_id);
CREATE INDEX IF NOT EXISTS idx_train_coupes_team ON public.train_coupes(shift_id, team_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.train_coupes TO authenticated;
GRANT ALL ON public.train_coupes TO service_role;

ALTER TABLE public.train_coupes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.my_coupe_key(_user_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT coalesce(tc.shift_id::text, 'none') || '|' || tc.team_number || '|' || tc.coupe_number
  FROM public.train_coupes tc
  WHERE tc.child_id = private.my_child_id(_user_id)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION private.my_coupe_key(uuid) TO authenticated;

CREATE POLICY "Staff can read train coupes"
ON public.train_coupes FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY "Child can read own coupe"
ON public.train_coupes FOR SELECT TO authenticated
USING (
  (coalesce(shift_id::text, 'none') || '|' || team_number || '|' || coupe_number)
  = private.my_coupe_key(auth.uid())
);

CREATE POLICY "Admins can insert train coupes"
ON public.train_coupes FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update train coupes"
ON public.train_coupes FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete train coupes"
ON public.train_coupes FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));