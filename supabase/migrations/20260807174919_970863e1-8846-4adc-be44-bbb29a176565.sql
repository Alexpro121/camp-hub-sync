ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS shift_category TEXT NOT NULL DEFAULT 'short',
  ADD COLUMN IF NOT EXISTS assigned_teams INT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS travel_start_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hotel_start_date DATE DEFAULT NULL;

UPDATE public.shifts SET shift_category = shift_type WHERE shift_type IN ('short','long','international');