import { useCallback, useEffect, useState } from 'react';

export type StaffTheme = 'dark' | 'light';
const KEY = 'helpsuprov:staff-theme';

export function useStaffTheme(): [StaffTheme, () => void] {
  const [theme, setTheme] = useState<StaffTheme>(() => (localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    const sync = () => setTheme(localStorage.getItem(KEY) === 'light' ? 'light' : 'dark');
    window.addEventListener('staff-theme-change', sync);
    return () => window.removeEventListener('staff-theme-change', sync);
  }, []);
  const toggle = useCallback(() => {
    setTheme((t) => { const n = t === 'light' ? 'dark' : 'light'; localStorage.setItem(KEY, n); return n; });
  }, []);
  return [theme, toggle];
}

/** Прибирає застарілу інверсію документа (стара реалізація світлої теми). */
export function clearLegacyInvert() { document.documentElement.classList.remove('staff-invert'); }
