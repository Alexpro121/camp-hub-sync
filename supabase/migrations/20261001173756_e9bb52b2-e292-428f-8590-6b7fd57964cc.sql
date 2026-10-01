ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS shift_id uuid;
CREATE INDEX IF NOT EXISTS notifications_shift_idx ON public.notifications(shift_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.notification_shift_of(m jsonb)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; k text;
BEGIN
  IF m IS NULL THEN RETURN NULL; END IF;
  BEGIN
    IF m ? 'shift_id' THEN RETURN (m->>'shift_id')::uuid; END IF;
    FOREACH k IN ARRAY ARRAY['child_id','a','b'] LOOP
      IF m ? k THEN
        SELECT shift_id INTO v FROM public.children WHERE id = (m->>k)::uuid;
        IF v IS NOT NULL THEN RETURN v; END IF;
      END IF;
    END LOOP;
    IF m ? 'request_id' THEN
      SELECT c.shift_id INTO v FROM public.transfer_requests r JOIN public.children c ON c.id = r.child_1_id
      WHERE r.id = (m->>'request_id')::uuid;
      RETURN v;
    END IF;
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION private.set_notification_shift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.shift_id IS NULL THEN NEW.shift_id := private.notification_shift_of(NEW.metadata); END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notification_shift ON public.notifications;
CREATE TRIGGER trg_notification_shift BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION private.set_notification_shift();

UPDATE public.notifications SET shift_id = private.notification_shift_of(metadata) WHERE shift_id IS NULL;