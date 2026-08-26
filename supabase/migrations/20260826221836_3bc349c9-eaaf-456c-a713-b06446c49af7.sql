ALTER TABLE public.talent_entries
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technical_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS performance_order INTEGER,
  ADD COLUMN IF NOT EXISTS pause_after INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.talent_stage_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  access_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT talent_stage_access_shift_key UNIQUE (shift_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_stage_access TO authenticated;
GRANT ALL ON public.talent_stage_access TO service_role;

ALTER TABLE public.talent_stage_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage stage access" ON public.talent_stage_access;
CREATE POLICY "Authenticated manage stage access"
  ON public.talent_stage_access FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_talent_stage_access_updated_at
BEFORE UPDATE ON public.talent_stage_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Перевірка пароля сцени без розкриття самого пароля
CREATE OR REPLACE FUNCTION public.verify_stage_password(p_shift_id uuid, p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.talent_stage_access
    WHERE (p_shift_id IS NULL OR shift_id = p_shift_id)
      AND lower(btrim(access_password)) = lower(btrim(p_password))
  );
$$;

GRANT EXECUTE ON FUNCTION public.verify_stage_password(uuid, text) TO anon, authenticated;

-- Сховище медіафайлів вечора талантів
DROP POLICY IF EXISTS "Read talent media" ON storage.objects;
CREATE POLICY "Read talent media" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'talent-media');

DROP POLICY IF EXISTS "Upload talent media" ON storage.objects;
CREATE POLICY "Upload talent media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'talent-media');

DROP POLICY IF EXISTS "Delete talent media" ON storage.objects;
CREATE POLICY "Delete talent media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'talent-media');