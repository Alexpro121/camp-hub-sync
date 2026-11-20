-- Учасник, видалений на реєстрації, одразу зникає з команд (deleted_at),
-- а через 24 години його профіль стає недоступним: усі політики дитини
-- спираються на private.my_child_id, тож достатньо перестати його повертати.
CREATE OR REPLACE FUNCTION private.my_child_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.child_id
  FROM public.user_roles ur
  JOIN public.children c ON c.id = ur.child_id
  WHERE ur.user_id = _user_id
    AND ur.role = 'child'
    AND (c.deleted_at IS NULL OR c.deleted_at > now() - interval '24 hours')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.my_child_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.my_child_id(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_children_shift_deleted_at
  ON public.children (shift_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
