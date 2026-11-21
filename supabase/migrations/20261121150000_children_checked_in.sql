-- «На зміні»: дитина прибула й відмічена на реєстрації. Окремо від is_present — переклички супроводу,
-- яку тепер міняє лише супровід. Досі реєстрація теж писала в is_present, тож хто вже відмічений — прибув.
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS checked_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

UPDATE public.children
SET checked_in = true, checked_in_at = coalesce(updated_at, now())
WHERE is_present AND NOT checked_in;

-- Час відмітки ставить база: однаково для реєстрації, супроводу й офлайн-черги.
CREATE OR REPLACE FUNCTION private.stamp_child_checked_in()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.checked_in_at := CASE WHEN NEW.checked_in THEN coalesce(NEW.checked_in_at, now()) END;
  ELSIF NEW.checked_in IS DISTINCT FROM OLD.checked_in THEN
    NEW.checked_in_at := CASE WHEN NEW.checked_in THEN now() END;
  ELSE
    NEW.checked_in_at := OLD.checked_in_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_child_checked_in ON public.children;
CREATE TRIGGER stamp_child_checked_in
BEFORE INSERT OR UPDATE ON public.children
FOR EACH ROW EXECUTE FUNCTION private.stamp_child_checked_in();

CREATE INDEX IF NOT EXISTS children_shift_checked_in_idx ON public.children (shift_id, checked_in) WHERE deleted_at IS NULL;
