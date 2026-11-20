import type { ScheduleItem, ScheduleSubSlot } from '@/types/app';
import { toMinutes } from './scheduleCategories';
import { DEFAULT_DURATION } from './schedule';

type Range = { start: number; end: number };

/** Інтервал події в хвилинах; без кінця — стандартна тривалість, через північ — +1 доба. */
export function rangeOf(start?: string | null, end?: string | null): Range | null {
  const s = toMinutes(start);
  if (s == null) return null;
  let e = toMinutes(end);
  if (e == null) e = s + DEFAULT_DURATION;
  else if (e <= s) e += 1440;
  return { start: s, end: e };
}

/** Чи стосується подія команди: для всіх, явно для неї або через її підслот. */
export function itemForTeam(item: Pick<ScheduleItem, 'target_teams' | 'sub_slots' | 'has_sub_slots'>, team: number): boolean {
  const teams = Array.isArray(item.target_teams) ? item.target_teams.map(Number) : [];
  const slots = item.has_sub_slots === false || !Array.isArray(item.sub_slots) ? [] : (item.sub_slots as ScheduleSubSlot[]);
  if (slots.some((s) => s?.teams?.map(Number).includes(team))) return true;
  return teams.length === 0 || teams.includes(team);
}

/**
 * Події дня, з якими нова подія команди перетинається в часі.
 * Накладки дозволені — це лише попередження для супроводу.
 */
export function findOverlaps(
  candidate: { time_start: string | null; time_end: string | null },
  items: ScheduleItem[],
  team: number,
  excludeId?: string | null,
): ScheduleItem[] {
  const mine = rangeOf(candidate.time_start, candidate.time_end);
  if (!mine) return [];
  return items
    .filter((i) => i.id !== excludeId && itemForTeam(i, team))
    .filter((i) => {
      const other = rangeOf(i.time_start, i.time_end);
      return !!other && mine.start < other.end && other.start < mine.end;
    })
    .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''));
}
