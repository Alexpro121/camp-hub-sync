-- Супровід додає власні події для своєї команди. Автор події зберігається,
-- тож супровід змінює й видаляє лише свої події, а не події адміністратора.
ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

DROP POLICY IF EXISTS "Admins or own-team staff insert schedule items" ON public.schedule_items;
DROP POLICY IF EXISTS "Admins or own-team staff update schedule items" ON public.schedule_items;
DROP POLICY IF EXISTS "Admins or own-team staff delete schedule items" ON public.schedule_items;

-- Супровід: лише своя команда, лише від свого імені, лише в опублікований розклад
-- (чернетки адміністратора лишаються недоторканими).
CREATE POLICY "Admins or own-team staff insert schedule items" ON public.schedule_items FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_staff(auth.uid())
    AND target_teams = jsonb_build_array(private.my_team(auth.uid()))
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_id AND s.is_published AND s.deleted_at IS NULL)
  )
);

CREATE POLICY "Admins or own staff update schedule items" ON public.schedule_items FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (private.is_staff(auth.uid()) AND created_by = auth.uid() AND target_teams = jsonb_build_array(private.my_team(auth.uid())))
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_staff(auth.uid())
    AND created_by = auth.uid()
    AND target_teams = jsonb_build_array(private.my_team(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_id AND s.is_published AND s.deleted_at IS NULL)
  )
);

CREATE POLICY "Admins or own staff delete schedule items" ON public.schedule_items FOR DELETE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (private.is_staff(auth.uid()) AND created_by = auth.uid() AND target_teams = jsonb_build_array(private.my_team(auth.uid())))
);
