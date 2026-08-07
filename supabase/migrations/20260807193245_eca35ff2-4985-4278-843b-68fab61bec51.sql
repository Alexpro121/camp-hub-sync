ALTER TABLE public.train_coupes
  ADD COLUMN IF NOT EXISTS trip_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trip_name TEXT NOT NULL DEFAULT 'Подорож 1';

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS allow_coupe_swaps BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_approve_swaps BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_train_coupes_trip ON public.train_coupes (team_number, trip_number);

CREATE TABLE IF NOT EXISTS public.coupe_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  team_number INT NOT NULL,
  trip_number INT NOT NULL DEFAULT 1,
  requester_child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  target_child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  target_coupe_number INT NOT NULL,
  target_seat_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_peer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupe_swap_requests TO authenticated;
GRANT ALL ON public.coupe_swap_requests TO service_role;

ALTER TABLE public.coupe_swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "children see own swap requests"
  ON public.coupe_swap_requests FOR SELECT TO authenticated
  USING (
    requester_child_id = private.my_child_id(auth.uid())
    OR target_child_id = private.my_child_id(auth.uid())
  );

CREATE POLICY "staff see team swap requests"
  ON public.coupe_swap_requests FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = team_number)
  );

CREATE POLICY "children create own swap requests"
  ON public.coupe_swap_requests FOR INSERT TO authenticated
  WITH CHECK (requester_child_id = private.my_child_id(auth.uid()));

CREATE POLICY "children respond to swap requests"
  ON public.coupe_swap_requests FOR UPDATE TO authenticated
  USING (
    requester_child_id = private.my_child_id(auth.uid())
    OR target_child_id = private.my_child_id(auth.uid())
  )
  WITH CHECK (
    requester_child_id = private.my_child_id(auth.uid())
    OR target_child_id = private.my_child_id(auth.uid())
  );

CREATE POLICY "staff manage team swap requests"
  ON public.coupe_swap_requests FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = team_number)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = team_number)
  );

CREATE TRIGGER update_coupe_swap_requests_updated_at
  BEFORE UPDATE ON public.coupe_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_swap_requests_team ON public.coupe_swap_requests (team_number, status);
CREATE INDEX IF NOT EXISTS idx_swap_requests_target ON public.coupe_swap_requests (target_child_id, status);

CREATE OR REPLACE FUNCTION public.execute_coupe_swap(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_req public.coupe_swap_requests%ROWTYPE;
  v_req_seat INT;
  v_req_coupe INT;
  v_child UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_req FROM public.coupe_swap_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_req.status = 'approved' THEN RETURN TRUE; END IF;
  IF v_req.status = 'rejected' THEN RETURN FALSE; END IF;

  v_child := private.my_child_id(auth.uid());

  -- Only staff of the team, admins, or the participating children may execute.
  IF NOT (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = v_req.team_number)
    OR v_child IN (v_req.requester_child_id, v_req.target_child_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT seat_number, coupe_number INTO v_req_seat, v_req_coupe
  FROM public.train_coupes
  WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number
  LIMIT 1;

  IF v_req_seat IS NULL THEN RETURN FALSE; END IF;

  IF v_req.target_child_id IS NOT NULL THEN
    UPDATE public.train_coupes
       SET seat_number = -1, coupe_number = -1
     WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;

    UPDATE public.train_coupes
       SET seat_number = v_req_seat, coupe_number = v_req_coupe
     WHERE child_id = v_req.target_child_id AND trip_number = v_req.trip_number;

    UPDATE public.train_coupes
       SET seat_number = v_req.target_seat_number, coupe_number = v_req.target_coupe_number
     WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;
  ELSE
    UPDATE public.train_coupes
       SET seat_number = v_req.target_seat_number, coupe_number = v_req.target_coupe_number
     WHERE child_id = v_req.requester_child_id AND trip_number = v_req.trip_number;
  END IF;

  UPDATE public.coupe_swap_requests SET status = 'approved' WHERE id = p_request_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_coupe_swap(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_coupe_swap(UUID) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.coupe_swap_requests;