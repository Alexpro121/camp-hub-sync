CREATE TABLE public.hall_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  hall_id TEXT NOT NULL,
  team_number INTEGER NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  title TEXT NOT NULL DEFAULT 'Репетиція',
  is_visible_in_schedule BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

CREATE INDEX idx_hall_bookings_lookup ON public.hall_bookings (hall_id, booking_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hall_bookings TO authenticated;
GRANT ALL ON public.hall_bookings TO service_role;

ALTER TABLE public.hall_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hall bookings"
  ON public.hall_bookings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can book for own team"
  ON public.hall_bookings FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = team_number)
  );

CREATE POLICY "Staff can update own team bookings"
  ON public.hall_bookings FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = team_number)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = team_number)
  );

CREATE POLICY "Staff can delete own team bookings"
  ON public.hall_bookings FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin')
    OR (private.is_staff(auth.uid()) AND private.my_team(auth.uid()) = team_number)
  );

CREATE TRIGGER update_hall_bookings_updated_at
  BEFORE UPDATE ON public.hall_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();