import type { ScheduleCategory } from './schedule-parser-fallback';
import { Utensils, Activity, Mic2, Bus, Megaphone, Pin, type LucideIcon } from 'lucide-react';

export interface CategoryMeta {
  value: ScheduleCategory;
  label: string;
  icon: LucideIcon;
  /** tailwind token name from the `cat` palette */
  token: 'meal' | 'sports' | 'event' | 'transfer' | 'gathering' | 'general';
  gradient: string;
}

export const CATEGORY_META: Record<ScheduleCategory, CategoryMeta> = {
  meal: { value: 'meal', label: 'Харчування', icon: Utensils, token: 'meal', gradient: 'var(--gradient-meal)' },
  sports: { value: 'sports', label: 'Спорт', icon: Activity, token: 'sports', gradient: 'var(--gradient-sports)' },
  entertainment: { value: 'entertainment', label: 'Захід', icon: Mic2, token: 'event', gradient: 'var(--gradient-event)' },
  transfer: { value: 'transfer', label: 'Виїзд', icon: Bus, token: 'transfer', gradient: 'var(--gradient-transfer)' },
  gathering: { value: 'gathering', label: 'Збір', icon: Megaphone, token: 'gathering', gradient: 'var(--gradient-gathering)' },
  general: { value: 'general', label: 'Загальне', icon: Pin, token: 'general', gradient: 'var(--gradient-general)' },
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

/** Capitalize first letter, keep the rest as authored. */
export const sentenceCase = (s?: string | null): string => {
  const t = (s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};
