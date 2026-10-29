import type { ImportDay } from './scheduleImport';
import { fromMinutes, toMinutes } from './scheduleCategories';

const estimated = (description: string | null) => /завершення\s+орієнтовне/i.test(description ?? '');
const sharesTeams = (a: number[], b: number[]) => !a.length || !b.length || a.some((team) => b.includes(team));

/** Only labelled estimates are adjusted; source ranges are never rewritten. */
export function boundScheduleEstimates(days: ImportDay[]): { days: ImportDay[]; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const events = days.flatMap((day) => day.items.map((item) => {
    const start = toMinutes(item.time_start);
    const base = Date.parse(`${day.date}T00:00:00Z`) / 60000;
    return { item, base, start: start == null ? null : base + start };
  }));
  const bounded = days.map((day) => ({ ...day, items: day.items.map((item) => {
    const startMinute = toMinutes(item.time_start);
    const endMinute = toMinutes(item.time_end);
    if (!estimated(item.description) || startMinute == null || endMinute == null) return item;
    const base = Date.parse(`${day.date}T00:00:00Z`) / 60000;
    const start = base + startMinute;
    const end = base + endMinute + (endMinute < startMinute ? 1440 : 0);
    let boundary = end;
    for (const candidate of events) {
      if (candidate.start != null && candidate.start > start && candidate.start < boundary && sharesTeams(item.target_teams, candidate.item.target_teams)) boundary = candidate.start;
    }
    if (boundary === end) return item;
    const lastSlot = Math.max(start, ...item.sub_slots.map((slot) => {
      const minute = toMinutes(slot.time);
      return minute == null ? start : base + minute + (minute < startMinute ? 1440 : 0);
    }));
    if (lastSlot >= boundary && item.sub_slots.length) {
      errors.push(`${day.date}, ${item.title}: наступна подія починається до завершення заїздів; уточніть час або команди`);
      return item;
    }
    const time_end = fromMinutes(boundary - base);
    warnings.push(`${day.date}, ${item.title}: орієнтовний кінець скориговано з ${item.time_end} до ${time_end} перед наступною подією`);
    return { ...item, time_end };
  }) }));
  return { days: bounded, warnings, errors };
}