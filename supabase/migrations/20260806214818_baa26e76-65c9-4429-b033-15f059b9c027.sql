ALTER TABLE public.train_coupes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_train_coupes_updated_at ON public.train_coupes;
CREATE TRIGGER update_train_coupes_updated_at
BEFORE UPDATE ON public.train_coupes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS train_coupes_seat_unique
  ON public.train_coupes (COALESCE(shift_id, '00000000-0000-0000-0000-000000000000'::uuid), team_number, seat_number)
  WHERE seat_number IS NOT NULL;

DROP POLICY IF EXISTS "Staff can insert own team coupes" ON public.train_coupes;
CREATE POLICY "Staff can insert own team coupes" ON public.train_coupes
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid())));

DROP POLICY IF EXISTS "Staff can update own team coupes" ON public.train_coupes;
CREATE POLICY "Staff can update own team coupes" ON public.train_coupes
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid())))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid())));

DROP POLICY IF EXISTS "Staff can delete own team coupes" ON public.train_coupes;
CREATE POLICY "Staff can delete own team coupes" ON public.train_coupes
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.train_coupes TO authenticated;
GRANT ALL ON public.train_coupes TO service_role;