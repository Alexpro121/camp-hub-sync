ALTER TABLE public.children ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS deleted_at timestamptz;