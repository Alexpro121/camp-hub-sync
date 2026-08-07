-- 1. Children INSERT scoped to supervisor's own team
DROP POLICY IF EXISTS "Staff can insert children" ON public.children;
CREATE POLICY "Staff can insert own team children"
ON public.children
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_staff(auth.uid())
    AND private.my_team(auth.uid()) IS NOT NULL
    AND team_number = private.my_team(auth.uid())
  )
);

-- 2. fair_settings team scoping
DROP POLICY IF EXISTS "Staff manage own fair settings" ON public.fair_settings;
CREATE POLICY "Staff manage own fair settings"
ON public.fair_settings
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    supervisor_user_id = auth.uid()
    AND private.my_team(auth.uid()) IS NOT NULL
    AND (team_number IS NULL OR team_number = private.my_team(auth.uid()))
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    supervisor_user_id = auth.uid()
    AND private.my_team(auth.uid()) IS NOT NULL
    AND (team_number IS NULL OR team_number = private.my_team(auth.uid()))
  )
);

-- 3. talent_entries visible to children only when parent event is published
DROP POLICY IF EXISTS "Children read own team talent entries" ON public.talent_entries;
CREATE POLICY "Children read own team talent entries"
ON public.talent_entries
FOR SELECT
TO authenticated
USING (
  team_number = private.my_child_team(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.talent_events te
    WHERE te.id = talent_entries.event_id
      AND te.status = ANY (ARRAY['generated'::text, 'finished'::text])
  )
);

-- 4. Remove anonymous execute on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.execute_coupe_swap(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_iron_dollars(uuid, integer, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_fair_purchase(uuid, integer, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.execute_coupe_swap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_iron_dollars(uuid, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_fair_purchase(uuid, integer, uuid, integer) TO authenticated;