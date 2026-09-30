CREATE OR REPLACE FUNCTION private.my_team(_user_id uuid)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','private'
AS $$
  SELECT COALESCE(
    (SELECT team_number FROM public.user_roles
      WHERE user_id = _user_id AND role = 'supervisor'::public.app_role AND team_number IS NOT NULL LIMIT 1),
    (SELECT a.team_number FROM public.staff_assignments a JOIN public.shifts s ON s.id = a.shift_id
      WHERE a.staff_user_id = _user_id AND s.deleted_at IS NULL
      ORDER BY (current_date BETWEEN s.start_date AND s.end_date) DESC, s.start_date DESC LIMIT 1)
  )
$$;