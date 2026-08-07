
CREATE OR REPLACE FUNCTION private.my_child_team(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $$
  SELECT c.team_number
  FROM public.children c
  WHERE c.id = private.my_child_id(_user_id)
  LIMIT 1
$$;

-- BROADCASTS
DROP POLICY IF EXISTS "Everyone can read broadcasts" ON public.broadcasts;
CREATE POLICY "Staff read all broadcasts"
ON public.broadcasts FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY "Children read targeted broadcasts"
ON public.broadcasts FOR SELECT TO authenticated
USING (
  private.my_child_team(auth.uid()) IS NOT NULL
  AND (
    jsonb_array_length(coalesce(target_teams, '[]'::jsonb)) = 0
    OR to_jsonb(private.my_child_team(auth.uid())) <@ coalesce(target_teams, '[]'::jsonb)
  )
);

-- TALENT ENTRIES
DROP POLICY IF EXISTS "Everyone can read talent entries" ON public.talent_entries;
CREATE POLICY "Staff read all talent entries"
ON public.talent_entries FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY "Children read own team talent entries"
ON public.talent_entries FOR SELECT TO authenticated
USING (team_number = private.my_child_team(auth.uid()));

-- TALENT EVENTS
DROP POLICY IF EXISTS "Everyone can read talent events" ON public.talent_events;
CREATE POLICY "Staff read all talent events"
ON public.talent_events FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY "Children read published talent events"
ON public.talent_events FOR SELECT TO authenticated
USING (
  private.my_child_id(auth.uid()) IS NOT NULL
  AND status IN ('generated','finished')
);

-- CHILDREN UPDATE: strict team scoping
DROP POLICY IF EXISTS "Staff can update children" ON public.children;
CREATE POLICY "Admins can update children"
ON public.children FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Supervisors update own team children"
ON public.children FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND private.my_team(auth.uid()) IS NOT NULL
  AND team_number = private.my_team(auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND private.my_team(auth.uid()) IS NOT NULL
  AND team_number = private.my_team(auth.uid())
);
