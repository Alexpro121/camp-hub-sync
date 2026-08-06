import type { Shift } from '@/types/app';

/**
 * Determines if a shift is currently active based on real date,
 * regardless of the `is_active` DB flag.
 */
export function isShiftCurrent(s: Shift, today = new Date()): boolean {
  const t = today.toISOString().slice(0, 10);
  return s.start_date <= t && t <= s.end_date;
}

/**
 * Picks the most relevant active shift for supervisors:
 * 1. A shift containing today's date
 * 2. Otherwise the closest upcoming shift
 * 3. Otherwise the most recent finished shift
 */
export function pickActiveShift(shifts: Shift[], today = new Date()): Shift | null {
  if (!shifts.length) return null;
  const t = today.toISOString().slice(0, 10);
  const current = shifts.find((s) => s.start_date <= t && t <= s.end_date);
  if (current) return current;
  const upcoming = shifts
    .filter((s) => s.start_date > t)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (upcoming) return upcoming;
  return shifts
    .slice()
    .sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null;
}

export function shiftStatus(s: Shift, today = new Date()): 'active' | 'upcoming' | 'finished' {
  const t = today.toISOString().slice(0, 10);
  if (t < s.start_date) return 'upcoming';
  if (t > s.end_date) return 'finished';
  return 'active';
}
