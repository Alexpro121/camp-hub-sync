CREATE OR REPLACE FUNCTION private.my_team(_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT a.team_number FROM public.staff_assignments a JOIN public.shifts s ON s.id = a.shift_id
      WHERE a.staff_user_id = _user_id AND s.deleted_at IS NULL
        AND (now() AT TIME ZONE 'Europe/Kyiv')::date BETWEEN s.start_date AND s.end_date
      ORDER BY s.start_date DESC LIMIT 1),
    (SELECT team_number FROM public.user_roles
      WHERE user_id = _user_id AND role = 'supervisor'::public.app_role AND team_number IS NOT NULL LIMIT 1),
    (SELECT a.team_number FROM public.staff_assignments a JOIN public.shifts s ON s.id = a.shift_id
      WHERE a.staff_user_id = _user_id AND s.deleted_at IS NULL
      ORDER BY s.start_date DESC LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION private.get_user_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, public AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lookup_user_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT private.get_user_id_by_email(p_email)
$$;
REVOKE ALL ON FUNCTION public.lookup_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_user_id_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_train_coupes(p_shift_id uuid, p_trip_number integer, p_teams integer[], p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_count int;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.train_coupes
   WHERE trip_number = p_trip_number AND team_number = ANY(p_teams)
     AND shift_id IS NOT DISTINCT FROM p_shift_id;
  INSERT INTO public.train_coupes (shift_id, trip_number, trip_name, team_number, coupe_number, seat_number,
    child_id, passenger_name, boarding_city, passenger_role, is_staff)
  SELECT p_shift_id, p_trip_number, r->>'trip_name', (r->>'team_number')::int, (r->>'coupe_number')::int,
    NULLIF(r->>'seat_number','')::int, NULLIF(r->>'child_id','')::uuid, r->>'passenger_name',
    r->>'boarding_city', COALESCE(r->>'passenger_role','participant'), COALESCE((r->>'is_staff')::boolean, false)
  FROM jsonb_array_elements(p_rows) r;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.replace_train_coupes(uuid, integer, integer[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_train_coupes(uuid, integer, integer[], jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.sync_child_team_to_coupes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.team_number IS DISTINCT FROM OLD.team_number THEN
    UPDATE public.train_coupes SET team_number = NEW.team_number, updated_at = now() WHERE child_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS sync_child_team_to_coupes ON public.children;
CREATE TRIGGER sync_child_team_to_coupes AFTER UPDATE OF team_number ON public.children
  FOR EACH ROW EXECUTE FUNCTION private.sync_child_team_to_coupes();