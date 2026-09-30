CREATE OR REPLACE FUNCTION public.set_talent_order(p_ordered_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.talent_entries t SET order_index = x.idx - 1, updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS x(id, idx)
   WHERE t.id = x.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.set_talent_order(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_talent_order(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION private.norm_apos(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(COALESCE(t, ''), '’ʼ`‘´', '''''''''''')
$$;

CREATE OR REPLACE FUNCTION public.search_child_for_transfer(p_query text, p_shift_id uuid, p_my_team integer)
 RETURNS TABLE(id uuid, full_name text, team_number integer, gender text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF NOT (private.is_staff(auth.uid()) OR private.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'UNAUTHORIZED_STAFF_ONLY'; END IF;
  IF p_query IS NULL OR length(btrim(p_query)) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.full_name, c.team_number, c.gender FROM public.children c
  WHERE (p_shift_id IS NULL OR c.shift_id = p_shift_id) AND c.deleted_at IS NULL
    AND c.team_number <> p_my_team
    AND private.norm_apos(c.full_name) ILIKE '%' || private.norm_apos(btrim(p_query)) || '%'
  ORDER BY c.full_name LIMIT 10;
END; $function$;