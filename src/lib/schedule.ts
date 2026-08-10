import type { ScheduleItem } from '@/types/app';
import { fromMinutes, toMinutes } from './scheduleCategories';
import { supabase } from '@/integrations/supabase/client';

/** Fallback duration when the source row has no end time. */
export const DEFAULT_DURATION = 60;

export interface NormalizedScheduleItem {
  id: string;
  title: string;
  /** "23:56" */
  timeStart: string;
  /** "00:30" */
  timeEnd: string;
  /** Absolute start timestamp on the schedule date. */
  startAt: Date;
  /** Absolute end timestamp — automatically +1 day when timeEnd < timeStart. */
  endAt: Date;
  category: string;
  targetTeams: number[];
  /** Minutes since midnight of the schedule date (endMin may exceed 1440). */
  startMin: number;
  endMin: number;
  /** Formatted "HH:MM – HH:MM" range. */
  range: string;
  /** true when the event runs past 00:00 into the next day. */
  crossesMidnight: boolean;
  item: ScheduleItem;
}

/** Midnight Date of an ISO date string ("2026-08-07"). */
export const dayStartDate = (dateISO: string) => new Date(`${dateISO}T00:00:00`);

/** Minutes elapsed since midnight of `dateISO` at time `now` (can be negative or > 1440). */
export const minutesSinceDayStart = (dateISO: string, now: Date = new Date()) =>
  (now.getTime() - dayStartDate(dateISO).getTime()) / 60000;

/** ISO date shifted by `delta` days. */
export const shiftISODate = (dateISO: string, delta: number) => {
  const d = dayStartDate(dateISO);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Build absolute-timestamp events for one schedule day.
 * Events whose end time is earlier than their start time automatically roll
 * over to the next calendar day, so 23:56 – 00:30 stays a valid 34 min event.
 */
export const normalizeScheduleItems = (
  items: ScheduleItem[],
  dateISO: string,
): NormalizedScheduleItem[] => {
  const sorted = [...items].sort(
    (a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index,
  );
  const base = dayStartDate(dateISO).getTime();

  return sorted
    .map((i, idx) => {
      const startMin = toMinutes(i.time_start);
      if (startMin == null) return null;

      let endMin = toMinutes(i.time_end);
      if (endMin == null) {
        const nextStart = toMinutes(sorted[idx + 1]?.time_start);
        endMin =
          nextStart != null && nextStart > startMin
            ? Math.min(nextStart, startMin + DEFAULT_DURATION)
            : startMin + DEFAULT_DURATION;
      } else if (endMin <= startMin) {
        // Cross-midnight: the end belongs to the following calendar day.
        endMin += 1440;
      }

      const startAt = new Date(base + startMin * 60000);
      const endAt = new Date(base + endMin * 60000);

      return {
        id: i.id,
        title: i.title,
        timeStart: fromMinutes(startMin),
        timeEnd: fromMinutes(endMin),
        startAt,
        endAt,
        category: i.category || 'general',
        targetTeams: i.target_teams || [],
        startMin,
        endMin,
        range: `${fromMinutes(startMin)} – ${fromMinutes(endMin)}`,
        crossesMidnight: endMin > 1440,
        item: i,
      } as NormalizedScheduleItem;
    })
    .filter(Boolean) as NormalizedScheduleItem[];
};

/** Events that started before `now` and have not ended yet. */
export const ongoingEvents = (events: NormalizedScheduleItem[], now: Date = new Date()) =>
  events.filter((e) => e.startAt <= now && e.endAt > now);

/** Realtime channel used to push schedule changes to every connected client. */
export const SCHEDULE_CHANNEL = 'schedule-live';
export const SCHEDULE_UPDATED = 'SCHEDULE_UPDATED';

/** Notify all clients that the schedule changed (admin edits).
 *  Also pings the fair status channel so the "Ярмарок" tab appears instantly. */
export const broadcastScheduleUpdated = async (payload: Record<string, unknown> = {}) => {
  const ch = supabase.channel(SCHEDULE_CHANNEL);
  await ch.subscribe();
  await ch.send({ type: 'broadcast', event: SCHEDULE_UPDATED, payload });
  const fair = supabase.channel('fair_global_status');
  await fair.subscribe();
  await fair.send({ type: 'broadcast', event: 'FAIR_STATUS_UPDATED', payload });
  setTimeout(() => { supabase.removeChannel(ch); supabase.removeChannel(fair); }, 500);
};

/** Key used to detect duplicates across merged schedules of the same day. */
export const itemKey = (i: { time_start?: string | null; title?: string | null }) =>
  `${(i.time_start || '').trim()}|${(i.title || '').trim().toLowerCase()}`;

/** Drop duplicates (same start time + title); the last occurrence wins. */
export const dedupeItems = <T extends { time_start?: string | null; title?: string | null }>(items: T[]): T[] => {
  const map = new Map<string, T>();
  items.forEach((i) => map.set(itemKey(i), i));
  return [...map.values()];
};

/**
 * Multi-schedule overlay: camp-wide events (no shift) + the shift's own program.
 * Duplicates (same start time + title) collapse, shift-specific rows win.
 */
export const mergeScheduleLayers = (
  campWide: ScheduleItem[],
  shiftSpecific: ScheduleItem[],
): ScheduleItem[] =>
  dedupeItems([...campWide, ...shiftSpecific]).sort(
    (a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index,
  );

/** Keeps camp-wide rows (empty target_teams) plus rows aimed at this team. */
export const filterItemsForTeam = (items: ScheduleItem[], team: number | null): ScheduleItem[] =>
  team == null
    ? items
    : items.filter((i) => !i.target_teams?.length || i.target_teams.includes(team));

/**
 * All published schedule items for one date — merged across EVERY schedule
 * batch uploaded for that day (morning + evening + extra), sorted by start time.
 */
export const getScheduleForDate = async (
  shiftId: string | null,
  date: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<ScheduleItem[]> => {
  const publishedOnly = opts.publishedOnly !== false;
  let q = supabase.from('schedules').select('id').eq('date', date);
  if (publishedOnly) q = q.eq('is_published', true);
  // Overlay: the shift's own program PLUS camp-wide schedules (shift_id IS NULL).
  if (shiftId) q = q.or(`shift_id.eq.${shiftId},shift_id.is.null`);
  const { data: sch } = await q;
  const ids = (sch || []).map((s: { id: string }) => s.id);
  if (!ids.length) return [];
  const { data } = await supabase
    .from('schedule_items')
    .select('*')
    .in('schedule_id', ids)
    .order('time_start', { ascending: true });
  const items = (data || []) as unknown as ScheduleItem[];
  return dedupeItems(items).sort(
    (a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index,
  );
};
