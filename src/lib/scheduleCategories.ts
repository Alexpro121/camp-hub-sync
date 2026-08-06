import type { ScheduleCategory } from './schedule-parser-fallback';

export interface CategoryMeta {
  value: ScheduleCategory;
  label: string;
  emoji: string;
  /** tailwind token name from the `cat` palette */
  token: 'meal' | 'sports' | 'event' | 'transfer' | 'gathering' | 'general';
  gradient: string;
}

export const CATEGORY_META: Record<ScheduleCategory, CategoryMeta> = {
  meal: { value: 'meal', label: 'Харчування', emoji: '🍲', token: 'meal', gradient: 'var(--gradient-meal)' },
  sports: { value: 'sports', label: 'Спорт', emoji: '🧘', token: 'sports', gradient: 'var(--gradient-sports)' },
  entertainment: { value: 'entertainment', label: 'Захід', emoji: '🎤', token: 'event', gradient: 'var(--gradient-event)' },
  transfer: { value: 'transfer', label: 'Виїзд', emoji: '🚌', token: 'transfer', gradient: 'var(--gradient-transfer)' },
  gathering: { value: 'gathering', label: 'Збір', emoji: '📣', token: 'gathering', gradient: 'var(--gradient-gathering)' },
  general: { value: 'general', label: 'Загальне', emoji: '📌', token: 'general', gradient: 'var(--gradient-general)' },
};

export const CATEGORY_LIST = Object.values(CATEGORY_META);

export const catMeta = (c?: string | null): CategoryMeta =>
  CATEGORY_META[(c as ScheduleCategory) ?? 'general'] ?? CATEGORY_META.general;

/** "HH:MM" -> minutes since midnight */
export const toMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export const fromMinutes = (v: number): string => {
  const x = ((v % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

export const shiftTime = (t: string | null, delta: number): string | null => {
  const m = toMinutes(t);
  return m == null ? t : fromMinutes(m + delta);
};
