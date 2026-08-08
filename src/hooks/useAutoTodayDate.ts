import { useEffect, useRef } from 'react';

/** Local ISO date ("2026-08-09") — avoids UTC shifting of toISOString(). */
export const localISO = (d: Date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

type DateLike = Date | string | null;

const toISO = (v: DateLike) => (v instanceof Date ? localISO(v) : v);

/**
 * Keeps a selected date in sync with the real calendar day.
 * When midnight passes (or the user returns to the Mini App) and the user was
 * still looking at *yesterday*, the selection rolls over to today automatically.
 */
export function useAutoTodayDate(
  selectedDate: DateLike,
  setSelectedDate: (iso: string) => void,
) {
  const ref = useRef(selectedDate);
  ref.current = selectedDate;

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const today = localISO(now);
      const current = toISO(ref.current);
      if (!current || current === today) return;
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      // Only auto-advance from "yesterday" — never hijack a manual date choice.
      if (current === localISO(y)) setSelectedDate(today);
    };

    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const interval = setInterval(check, 10000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(interval);
    };
  }, [setSelectedDate]);
}
