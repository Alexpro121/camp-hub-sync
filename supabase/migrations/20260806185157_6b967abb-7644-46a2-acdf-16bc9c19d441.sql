-- ============ soft delete for shifts ============
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ============ indexes ============
CREATE INDEX IF NOT EXISTS idx_children_shift_team ON public.children(shift_id, team_number);
CREATE INDEX IF NOT EXISTS idx_children_normalized_name ON public.children(shift_id, full_name);
CREATE INDEX IF NOT EXISTS idx_children_phone ON public.children(shift_id, phone);
CREATE INDEX IF NOT EXISTS idx_shifts_active ON public.shifts(is_active) WHERE deleted_at IS NULL;

-- ============ iron dollar transactions ============
CREATE TABLE IF NOT EXISTS public.iron_dollar_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  supervisor_user_id uuid,
  performed_by text,
  amount_change integer NOT NULL,
  balance_after integer,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.iron_dollar_transactions TO authenticated;
GRANT ALL ON public.iron_dollar_transactions TO service_role;
ALTER TABLE public.iron_dollar_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read transactions" ON public.iron_dollar_transactions
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Child can read own transactions" ON public.iron_dollar_transactions
  FOR SELECT TO authenticated USING (child_id = private.my_child_id(auth.uid()));
CREATE POLICY "Staff can insert transactions" ON public.iron_dollar_transactions
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "Admins can delete transactions" ON public.iron_dollar_transactions
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_idt_child ON public.iron_dollar_transactions(child_id, created_at DESC);

-- ============ schedules ============
CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
  date date NOT NULL,
  raw_text text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read published schedules" ON public.schedules
  FOR SELECT TO authenticated USING (is_published OR private.is_staff(auth.uid()));
CREATE POLICY "Admins can insert schedules" ON public.schedules
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update schedules" ON public.schedules
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete schedules" ON public.schedules
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  time_start text,
  time_end text,
  title text NOT NULL,
  description text,
  target_teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_items TO authenticated;
GRANT ALL ON public.schedule_items TO service_role;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read items of visible schedules" ON public.schedule_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_id AND (s.is_published OR private.is_staff(auth.uid())))
  );
CREATE POLICY "Admins can insert schedule items" ON public.schedule_items
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update schedule items" ON public.schedule_items
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete schedule items" ON public.schedule_items
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule ON public.schedule_items(schedule_id, order_index);
CREATE TRIGGER update_schedule_items_updated_at BEFORE UPDATE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ talent events ============
CREATE TABLE IF NOT EXISTS public.talent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Вечір талантів',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_events TO authenticated;
GRANT ALL ON public.talent_events TO service_role;
ALTER TABLE public.talent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read talent events" ON public.talent_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert talent events" ON public.talent_events
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update talent events" ON public.talent_events
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete talent events" ON public.talent_events
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_talent_events_updated_at BEFORE UPDATE ON public.talent_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.talent_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.talent_events(id) ON DELETE CASCADE,
  team_number integer NOT NULL,
  title text NOT NULL,
  description text,
  break_needed_after integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_entries TO authenticated;
GRANT ALL ON public.talent_entries TO service_role;
ALTER TABLE public.talent_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read talent entries" ON public.talent_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert own team entries" ON public.talent_entries
  FOR INSERT TO authenticated WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
  );
CREATE POLICY "Staff can update own team entries" ON public.talent_entries
  FOR UPDATE TO authenticated USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
  ) WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
  );
CREATE POLICY "Staff can delete own team entries" ON public.talent_entries
  FOR DELETE TO authenticated USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR (private.is_staff(auth.uid()) AND team_number = private.my_team(auth.uid()))
  );
CREATE INDEX IF NOT EXISTS idx_talent_entries_event ON public.talent_entries(event_id, order_index);
CREATE TRIGGER update_talent_entries_updated_at BEFORE UPDATE ON public.talent_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ broadcasts ============
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  color text NOT NULL DEFAULT 'info',
  target_teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_by text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can send broadcasts" ON public.broadcasts
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "Admins can delete broadcasts" ON public.broadcasts
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
GRANT DELETE ON public.broadcasts TO authenticated;
CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON public.broadcasts(created_at DESC);

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talent_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talent_entries;