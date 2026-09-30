ALTER TABLE public.staff_invites
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS staff_invites_shift_id_idx
  ON public.staff_invites (shift_id)
  WHERE shift_id IS NOT NULL;