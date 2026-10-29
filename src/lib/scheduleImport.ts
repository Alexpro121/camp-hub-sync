import { z } from 'zod';
import { safeParseScheduleJson } from './json-sanitizer';
import { normalizeCategory, normalizeTime, normalizeTimeRange } from './scheduleCategories';

const teams = z.array(z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())]))
  .nullish().transform((value) => [...new Set(value ?? [])].sort((a, b) => a - b));
const optionalText = z.string().trim().nullish().transform((value) => value || null);
const slotSchema = z.object({ time: z.string(), teams, title: optionalText, location: optionalText });
const itemSchema = z.object({
  title: z.string().trim().min(1, 'Відсутня назва події'),
  time_start: z.string().trim().min(1, 'Відсутній час початку'),
  time_end: optionalText, description: optionalText, location: optionalText,
  category: optionalText, target_teams: teams,
  has_sub_slots: z.boolean().nullish(), sub_slots: z.array(slotSchema).nullish(),
});

export interface ImportItem {
  title: string; time_start: string; time_end: string | null;
  description: string | null; location: string | null; category: string;
  target_teams: number[]; has_sub_slots: boolean;
  sub_slots: { time: string; teams: number[]; title?: string | null; location?: string | null }[];
}
export interface ImportDay { date: string; items: ImportItem[] }
export interface ImportPreview { days: ImportDay[]; errors: string[]; warnings: string[]; total: number; duplicates: number }

export function validScheduleDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Full event identity keeps simultaneous workshops for different teams/locations. */
export function scheduleImportKey(item: { title?: string | null; time_start?: string | null; location?: string | null; target_teams?: unknown }): string {
  const teams = Array.isArray(item.target_teams) ? [...new Set(item.target_teams.map(Number))].sort((a, b) => a - b) : [];
  return JSON.stringify([normalizeTime(item.time_start) ?? '', item.title?.trim().toLocaleLowerCase('uk') ?? '', item.location?.trim().toLocaleLowerCase('uk') ?? '', teams]);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function previewScheduleImport(input: string, fallbackDate: string): ImportPreview {
  const result: ImportPreview = { days: [], errors: [], warnings: [], total: 0, duplicates: 0 };
  const parsed = safeParseScheduleJson(input);
  if (parsed.ok === false) { result.errors.push(parsed.error.message); return result; }
  let root: unknown = parsed.value;
  if (record(root) && Array.isArray(root.days)) root = root.days;
  if (record(root) && Array.isArray(root.events)) root = root.events;
  const entries: unknown[] = Array.isArray(root) ? root : [root];
  const bareItems = entries.length > 0 && entries.every((entry) => record(entry) && 'title' in entry && !('items' in entry));
  const days = bareItems ? entries.map((entry) => ({ date: record(entry) ? entry.date ?? fallbackDate : fallbackDate, items: [entry] })) : entries;
  const grouped = new Map<string, ImportDay>();
  const seen = new Set<string>();
  days.forEach((day, dayIndex) => {
    if (!record(day) || !Array.isArray(day.items)) { result.errors.push(`День ${dayIndex + 1}: очікується масив items`); return; }
    const date = day.date == null ? fallbackDate : day.date;
    if (typeof date !== 'string' || !validScheduleDate(date)) { result.errors.push(`День ${dayIndex + 1}: некоректна дата ${String(date)}`); return; }
    if (day.date == null) result.warnings.push(`День ${dayIndex + 1}: використано обрану дату ${fallbackDate}`);
    const target = grouped.get(date) ?? { date, items: [] };
    grouped.set(date, target);
    day.items.forEach((raw, index) => {
      const label = `${date}, подія ${index + 1}`;
      const validation = itemSchema.safeParse(raw);
      if (!validation.success) { result.errors.push(`${label}: ${validation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`); return; }
      const value = validation.data;
      const range = normalizeTimeRange(value.time_start);
      let end = value.time_end ? normalizeTime(value.time_end) : range.end;
      if (!range.start || (value.time_end && !end)) { result.errors.push(`${label}: некоректний час`); return; }
      if (end === range.start) {
        end = null;
        result.warnings.push(`${label}: однаковий час завершення прибрано; тривалість не визначена`);
      }
      const slots: ImportItem['sub_slots'] = [];
      for (const slot of value.sub_slots ?? []) {
        const time = normalizeTime(slot.time);
        if (!time || !slot.teams?.length) { result.errors.push(`${label}: некоректний час або команди у sub_slots`); return; }
        const startMin = Number(range.start.slice(0, 2)) * 60 + Number(range.start.slice(3));
        const slotMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
        const endMin = end ? Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) : null;
        const offset = (slotMin - startMin + 1440) % 1440;
        const duration = endMin == null ? null : (endMin - startMin + 1440) % 1440;
        if (duration != null && offset > duration) { result.errors.push(`${label}: заїзд ${time} за межами події`); return; }
        slots.push({ time, teams: slot.teams, title: slot.title, location: slot.location });
      }
      if (!end && value.time_end !== value.time_start) result.warnings.push(`${label}: кінець не вказаний`);
      if (/дітям не говор|дітям не каз|супровід.{0,20}(веде|збирає)|секретн.*інструкц/i.test(`${value.title} ${value.description ?? ''}`)) result.warnings.push(`${label}: перевірте внутрішні вказівки — опис бачитимуть учасники`);
      const item: ImportItem = { title: value.title ?? '', description: value.description ?? null, location: value.location ?? null, target_teams: value.target_teams ?? [], time_start: range.start, time_end: end, category: normalizeCategory(value.category), has_sub_slots: slots.length > 0, sub_slots: slots };
      const key = `${date}|${scheduleImportKey(item)}`;
      if (seen.has(key)) { result.duplicates++; return; }
      seen.add(key); target.items.push(item); result.total++;
    });
  });
  result.days = [...grouped.values()].filter((day) => day.items.length).sort((a, b) => a.date.localeCompare(b.date));
  result.days.forEach((day) => day.items.sort((a, b) => a.time_start.localeCompare(b.time_start)));
  if (!result.total && !result.errors.length) result.errors.push('У JSON немає жодної події');
  return result;
}