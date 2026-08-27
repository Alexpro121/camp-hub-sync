CREATE OR REPLACE FUNCTION public.get_stage_console_data(p_shift_id uuid, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ok boolean;
  v_event public.talent_events%ROWTYPE;
  v_entries jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.talent_stage_access
    WHERE (p_shift_id IS NULL OR shift_id = p_shift_id)
      AND lower(btrim(access_password)) = lower(btrim(COALESCE(p_password, '')))
  ) INTO v_ok;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  SELECT * INTO v_event
  FROM public.talent_events
  WHERE (p_shift_id IS NULL OR shift_id = p_shift_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('status', 'ok', 'event', NULL, 'entries', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.order_index), '[]'::jsonb)
    INTO v_entries
  FROM public.talent_entries t
  WHERE t.event_id = v_event.id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'event', to_jsonb(v_event),
    'entries', v_entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_stage_console_data(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stage_console_data(uuid, text) TO anon, authenticated;