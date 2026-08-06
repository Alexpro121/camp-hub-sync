ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS train_coupes_published BOOLEAN NOT NULL DEFAULT FALSE;

DROP POLICY IF EXISTS "Child can read own coupe" ON public.train_coupes;
CREATE POLICY "Child can read own coupe" ON public.train_coupes
FOR SELECT TO authenticated
USING (
  ((((COALESCE(shift_id::text, 'none') || '|') || team_number) || '|') || coupe_number) = private.my_coupe_key(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.train_coupes_published = TRUE
      AND (s.id = train_coupes.shift_id OR (train_coupes.shift_id IS NULL AND s.is_active))
  )
);