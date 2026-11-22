-- Імпорт списку адміном («Наявність» з таблиці реєстрації) — відмітка реєстрації, а не супроводу:
-- інакше стійка показувала всіх прибулих з таблиці жовтими «відмітив супровід».
-- Зміни відмітки після створення визначаються як і раніше: сервісна роль — реєстрація, вхід у застосунок — супровід.
CREATE OR REPLACE FUNCTION private.stamp_child_checked_in()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  who text := CASE
    WHEN auth.uid() IS NULL THEN 'registry'
    WHEN TG_OP = 'INSERT' AND private.has_role(auth.uid(), 'admin'::public.app_role) THEN 'registry'
    ELSE 'staff'
  END;
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
