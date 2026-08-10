import type { ScheduleCategory } from './schedule-parser-fallback';
import { Utensils, Activity, Mic2, Bus, Megaphone, Pin, ShoppingBag, type LucideIcon } from 'lucide-react';

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
  fair: { value: 'fair', label: 'Ярмарок', icon: ShoppingBag, token: 'event', gradient: 'var(--gradient-event)' },
  gathering: { value: 'gathering', label: 'Збір', icon: Megaphone, token: 'gathering', gradient: 'var(--gradient-gathering)' },
  general: { value: 'general', label: 'Загальне', icon: Pin, token: 'general', gradient: 'var(--gradient-general)' },
};

export const CATEGORY_LIST = Object.values(CATEGORY_META);

export const catMeta = (c?: string | null): CategoryMeta =>
  CATEGORY_META[(c as ScheduleCategory) ?? 'general'] ?? CATEGORY_META.general;

/**
 * Accepts any human time input — "14:25", "14.25", "14 25", "14-25", "1425",
 * "9:5", "9" — and returns the canonical "HH:MM", or null when unparsable.
 */
export const normalizeTime = (raw?: string | null): string | null => {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\s*[:.,\-–—\s]?\s*(\d{1,2})?$/) ?? t.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] == null || m[2] === '' ? 0 : Number(m[2].length === 1 ? `${m[2]}0` : m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

/** Splits "14.25 - 14.56" / "14:25—14:56" into normalized start + end. */
export const normalizeTimeRange = (raw?: string | null): { start: string | null; end: string | null } => {
  const t = (raw ?? '').trim();
  const parts = t.split(/\s*(?:-|–|—|до)\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const start = normalizeTime(parts[0]);
    const end = normalizeTime(parts[1]);
    if (start && end) return { start, end };
  }
  return { start: normalizeTime(t), end: null };
};

/** Any supported time format -> minutes since midnight */
export const toMinutes = (t?: string | null): number | null => {
  const norm = normalizeTime(t);
  if (!norm) return null;
  const [h, m] = norm.split(':').map(Number);
  return h * 60 + m;
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
