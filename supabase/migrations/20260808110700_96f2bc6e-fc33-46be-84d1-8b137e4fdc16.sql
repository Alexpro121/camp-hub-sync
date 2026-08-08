DROP POLICY IF EXISTS "Authenticated can read fair preset codes" ON public.fair_preset_codes;

CREATE POLICY "Children can read own shift fair preset codes"
ON public.fair_preset_codes
FOR SELECT TO authenticated
USING (
  shift_id IS NOT NULL
  AND shift_id = (
    SELECT c.shift_id FROM public.children c
    WHERE c.id = private.my_child_id(auth.uid())
  )
);