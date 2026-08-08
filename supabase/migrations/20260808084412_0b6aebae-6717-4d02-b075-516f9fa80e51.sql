ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS allow_coupe_swaps BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_approve_swaps BOOLEAN NOT NULL DEFAULT FALSE;

DROP POLICY IF EXISTS "Staff can update shift coupe settings" ON public.shifts;
CREATE POLICY "Staff can update shift coupe settings" ON public.shifts
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

-- Staff may only flip the two coupe-swap switches; everything else stays admin-only.
CREATE OR REPLACE FUNCTION public.guard_shift_staff_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF private.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'allow_coupe_swaps' - 'auto_approve_swaps' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'allow_coupe_swaps' - 'auto_approve_swaps' - 'updated_at') THEN
    RAISE EXCEPTION 'forbidden: staff may only change coupe swap settings';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_shift_staff_update ON public.shifts;
CREATE TRIGGER guard_shift_staff_update
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_shift_staff_update();

ALTER TABLE public.shifts REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
  END IF;
END $$;