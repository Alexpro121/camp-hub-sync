import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import type { Schedule, ScheduleItem, ScheduleSubSlot } from '@/types/app';
import { fromMinutes, sentenceCase, toMinutes } from '@/lib/scheduleCategories';

const KEY = 'helpsuprov:event-reminders';
const LEAD_MIN = 5;
const DEFAULT_DURATION = 60;

const todayISO = () => new Date().toISOString().slice(0, 10);

const readFired = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};

const slotsOf = (i: ScheduleItem): ScheduleSubSlot[] =>
  Array.isArray(i.sub_slots) ? (i.sub_slots as ScheduleSubSlot[]).filter((s) => s && s.time) : [];

interface Alert {
  id: string;
  title: string;
  startMin: number;
  range: string;
  myTime: string | null;
  myTeams: number[] | null;
  category: string | null;
}

/**
 * App-wide background watcher: regardless of the screen the child is on, it
 * surfaces the Dynamic Island 5 minutes before an event and at its start.
 */
export const useScheduleNotifier = (team: number | null, enabled = true) => {
  const { showEventAlert } = useDynamicIsland();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alertsRef = useRef<Alert[]>([]);
  alertsRef.current = alerts;

  // Load (and keep in sync) today's published schedule.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout>;

    const load = async () => {
      const { data: sch } = await supabase
        .from('schedules')
        .select('*')
        .eq('is_published', true)
        .eq('date', todayISO())
        .limit(1);
      const day = (sch as Schedule[] | null)?.[0];
      if (!day) { if (!cancelled) setAlerts([]); return; }

      const { data: its } = await supabase
        .from('schedule_items')
        .select('*')
        .eq('schedule_id', day.id)
        .order('order_index');
      if (cancelled) return;

      const list = ((its || []) as unknown as ScheduleItem[])
        .filter((i) =>
          team == null ||
          !i.target_teams?.length ||
          i.target_teams.includes(team) ||
          slotsOf(i).some((s) => s.teams?.includes(team)))
        .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index);

      const built: Alert[] = [];
      list.forEach((i, idx) => {
        const start = toMinutes(i.time_start);
        if (start == null) return;
        const nextStart = toMinutes(list[idx + 1]?.time_start);
        const end = toMinutes(i.time_end) ??
          (nextStart != null && nextStart > start ? Math.min(nextStart, start + DEFAULT_DURATION) : start + DEFAULT_DURATION);
        const slot = team != null ? slotsOf(i).find((s) => s.teams?.includes(team)) : undefined;
        const slotMin = toMinutes(slot?.time ?? null);
        built.push({
          id: i.id,
          title: sentenceCase(i.title),
          startMin: slotMin ?? start,
          range: `${fromMinutes(start)} – ${fromMinutes(end)}`,
          myTime: slotMin != null ? fromMinutes(slotMin) : null,
          myTeams: slot?.teams ?? null,
          category: i.category ?? null,
        });
      });
      setAlerts(built);
    };

    load();
    const debounced = () => { clearTimeout(debounce); debounce = setTimeout(load, 800); };
    const ch = supabase
      .channel('schedule-notifier')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, debounced)
      .subscribe();
    return () => { cancelled = true; clearTimeout(debounce); supabase.removeChannel(ch); };
  }, [team, enabled]);

  // Tick: fire each reminder once per day.
  useEffect(() => {
    if (!enabled) return;
    const day = todayISO();

    const tick = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const fired = readFired();
      let dirty = false;

      for (const ev of alertsRef.current) {
        const checks: Array<{ kind: 'pre' | 'start'; at: number }> = [
          { kind: 'pre', at: ev.startMin - LEAD_MIN },
          { kind: 'start', at: ev.startMin },
        ];
        for (const c of checks) {
          const key = `${day}:${ev.id}:${c.kind}`;
          if (nowMin >= c.at && nowMin <= c.at + 2 && !fired[key]) {
            fired[key] = Date.now();
            dirty = true;
            showEventAlert({
              eventTitle: ev.title,
              range: ev.range,
              myTime: ev.myTime,
              myTeams: ev.myTeams,
              phase: c.kind,
              category: ev.category,
            });
          }
        }
      }

      if (dirty) {
        const pruned = Object.fromEntries(Object.entries(fired).filter(([k]) => k.startsWith(`${day}:`)));
        try { localStorage.setItem(KEY, JSON.stringify(pruned)); } catch { /* ignore */ }
      }
    };

    tick();
    const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, [enabled, showEventAlert]);
};
