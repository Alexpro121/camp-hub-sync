ALTER TABLE public.children ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.children ADD CONSTRAINT children_gender_check CHECK (gender IS NULL OR gender IN ('boy','girl','unknown'));