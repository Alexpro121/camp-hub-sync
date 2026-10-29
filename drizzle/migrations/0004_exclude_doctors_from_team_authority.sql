CREATE OR REPLACE FUNCTION private.my_team(_user_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT CASE WHEN EXISTS (SELECT 1 FROM public.staff_members WHERE user_id = _user_id AND (kind = 'doctor' OR NOT is_active)) THEN NULL ELSE COALESCE(
(SELECT a.team_number FROM public.staff_assignments a JOIN public.shifts s ON s.id = a.shift_id WHERE a.staff_user_id = _user_id AND s.deleted_at IS NULL AND (now() AT TIME ZONE 'Europe/Kyiv')::date BETWEEN s.start_date AND s.end_date ORDER BY s.start_date DESC LIMIT 1),
(SELECT team_number FROM public.user_roles WHERE user_id = _user_id AND role = 'supervisor'::public.app_role AND team_number IS NOT NULL LIMIT 1),
(SELECT a.team_number FROM public.staff_assignments a JOIN public.shifts s ON s.id = a.shift_id WHERE a.staff_user_id = _user_id AND s.deleted_at IS NULL ORDER BY s.start_date DESC LIMIT 1)) END;
$$;