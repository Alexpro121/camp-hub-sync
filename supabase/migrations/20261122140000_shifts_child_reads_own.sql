-- Дитина бачить свою зміну (лише її): застосунку треба знати тип зміни, щоб підписати команду «1-СПОРТ».
DROP POLICY IF EXISTS "Child can read own shift" ON public.shifts;
CREATE POLICY "Child can read own shift" ON public.shifts
  FOR SELECT TO authenticated
  USING (id = (SELECT c.shift_id FROM public.children c WHERE c.id = private.my_child_id(auth.uid())));
