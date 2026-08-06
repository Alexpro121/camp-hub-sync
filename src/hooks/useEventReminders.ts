import { useEffect, useRef } from 'react';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { useHaptics } from './useHaptics';

export interface ReminderEvent {
  id: string;
  title: string;
  /** minutes since midnight */
  startMin: number;
  /** "HH:MM" label shown to the user */
  timeLabel: string;
}

const KEY = 'helpsuprov:event-reminders';
const LEAD_MIN = 5;

const readFired = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};

/**
 * Fires two local reminders per event of the current day: 5 minutes before the
 * start and exactly at the start. Each reminder is delivered once per day
 * (persisted in localStorage) through the Dynamic Island + haptics.
 */
export const useEventReminders = (events: ReminderEvent[], enabled: boolean, dayISO: string) => {
  const { showSuccess } = useDynamicIsland();
  const haptics = useHaptics();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const fired = readFired();
      let dirty = false;

      for (const ev of eventsRef.current) {
        const checks: Array<{ kind: string; at: number; title: string; sub: string }> = [
          {
            kind: 'pre',
            at: ev.startMin - LEAD_MIN,
            title: `За ${LEAD_MIN} хв: ${ev.title}`,
            sub: `Початок о ${ev.timeLabel}`,
          },
          { kind: 'start', at: ev.startMin, title: `Починається: ${ev.title}`, sub: ev.timeLabel },
        ];
        for (const c of checks) {
          const key = `${dayISO}:${ev.id}:${c.kind}`;
          // Fire within a 2-minute window so a backgrounded tab still catches it.
          if (nowMin >= c.at && nowMin <= c.at + 2 && !fired[key]) {
            fired[key] = Date.now();
            dirty = true;
            showSuccess(c.title, c.sub);
            haptics.notification('warning');
          }
        }
      }

      if (dirty) {
        // Keep only the current day's keys so the store never grows.
        const pruned = Object.fromEntries(Object.entries(fired).filter(([k]) => k.startsWith(`${dayISO}:`)));
        try { localStorage.setItem(KEY, JSON.stringify(pruned)); } catch { /* ignore */ }
      }
    };

    tick();
    const t = setInterval(tick, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dayISO]);
};
