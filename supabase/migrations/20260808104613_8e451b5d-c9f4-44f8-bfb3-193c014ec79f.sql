ALTER TABLE public.train_coupes
ADD COLUMN IF NOT EXISTS passenger_role TEXT NOT NULL DEFAULT 'participant';

COMMENT ON COLUMN public.train_coupes.passenger_role IS 'Роль у купе: participant (Учасник), supervisor (Супровід), speaker (Спікер), admin (Адміністрація)';