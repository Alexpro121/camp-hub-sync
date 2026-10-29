import { useEffect, useRef } from 'react';

/** Сьогоднішня дата за Києвом — незалежно від часового поясу телефону. */
export const kyivISO = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d);

/** Календарна дата за Києвом (а не за годинником пристрою) — збігається з сервером і зміною. */
export const localISO = (d: Date = new Date()) => kyivISO(d);

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
