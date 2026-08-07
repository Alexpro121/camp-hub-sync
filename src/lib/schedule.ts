import type { ScheduleItem } from '@/types/app';
import { fromMinutes, toMinutes } from './scheduleCategories';

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
