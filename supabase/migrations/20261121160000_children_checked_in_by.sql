-- Хто поставив «на зміні»: стійка реєстрації (функція registry, сервісна роль) чи супровід (вхід у застосунок).
-- Визначає база за auth.uid(), тож клієнт не може підробити джерело. Стійка показує відмітку супроводу жовтою.
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS checked_in_by text CHECK (checked_in_by IN ('registry', 'staff'));

UPDATE public.children SET checked_in_by = 'registry' WHERE checked_in AND checked_in_by IS NULL;

CREATE OR REPLACE FUNCTION private.stamp_child_checked_in()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  who text := CASE WHEN auth.uid() IS NULL THEN 'registry' ELSE 'staff' END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.checked_in_at := CASE WHEN NEW.checked_in THEN coalesce(NEW.checked_in_at, now()) END;
    NEW.checked_in_by := CASE WHEN NEW.checked_in THEN who END;
  ELSIF NEW.checked_in IS DISTINCT FROM OLD.checked_in THEN
    NEW.checked_in_at := CASE WHEN NEW.checked_in THEN now() END;
    NEW.checked_in_by := CASE WHEN NEW.checked_in THEN who END;
  ELSE
    NEW.checked_in_at := OLD.checked_in_at;
    NEW.checked_in_by := OLD.checked_in_by;
  END IF;
  RETURN NEW;
END;
$$;
