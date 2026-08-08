/**
 * Fair mode resolver.
 *
 * The fair ("Ярмарок") is active strictly between the OVERALL start and end of
 * the fair event (e.g. 18:26 – 18:56). Per-team `sub_slots` are irrelevant here
 * and must never shorten the window. Dynamic Island auto-hide is a purely
 * visual concern and never touches this state.
 */
import type { ScheduleItem } from '@/types/app';
import { normalizeScheduleItems, type NormalizedScheduleItem } from './schedule';

const FAIR_RE = /(ярмарок|ярмарка|ярмарки|ярмарков|fair|market)/i;

export interface FairLike {
  title?: string | null;
  description?: string | null;
}

/** True when the row's title/description names a fair. */
export const isFairEvent = (i: FairLike | null | undefined): boolean =>
  !!i && FAIR_RE.test(`${i.title ?? ''} ${i.description ?? ''}`);

export interface FairWindow {
  active: boolean;
  /** Timestamp when the running fair ends (null when none is running). */
  endsAt: number | null;
  /** Timestamp when the next fair of the day starts (null when none). */
  startsAt: number | null;
}

/**
 * Whole-event window check. Ignores sub-slots entirely:
 * active === now >= startAt && now < endAt.
 */
export const resolveFairWindow = (
  events: NormalizedScheduleItem[],
  now: Date = new Date(),
): FairWindow => {
  const t = now.getTime();
  const fairs = events.filter((e) => isFairEvent(e.item));
  const running = fairs.find((e) => t >= e.startAt.getTime() && t < e.endAt.getTime());
  if (running) return { active: true, endsAt: running.endAt.getTime(), startsAt: running.startAt.getTime() };
  const upcoming = fairs
    .filter((e) => e.startAt.getTime() > t)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  return { active: false, endsAt: null, startsAt: upcoming ? upcoming.startAt.getTime() : null };
};

/** Same check from raw rows of one schedule date. */
export const resolveFairWindowFromItems = (
  itemsByDate: { date: string; items: ScheduleItem[] }[],
  now: Date = new Date(),
): FairWindow => {
  const events = itemsByDate.flatMap((g) => normalizeScheduleItems(g.items, g.date));
  return resolveFairWindow(events, now);
};

/** True while `now` sits inside the event range (cross-midnight safe). */
export const isEventLive = (
  event: { startAt: Date; endAt: Date },
  now: Date = new Date(),
): boolean => {
  const t = now.getTime();
  return t >= event.startAt.getTime() && t < event.endAt.getTime();
};

/** Convenience check straight from raw schedule rows of the current day(s). */
export const isFairCurrentlyActive = (
  itemsByDate: { date: string; items: ScheduleItem[] }[],
  now: Date = new Date(),
): boolean => resolveFairWindowFromItems(itemsByDate, now).active;
