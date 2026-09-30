import { useCallback, useEffect, useState } from 'react';

export type StaffTheme = 'dark' | 'light';
const KEY = 'helpsuprov:staff-theme';

export function useStaffTheme(): [StaffTheme, () => void] {
  const [theme, setTheme] = useState<StaffTheme>(() => (localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'));
  const toggle = useCallback(() => {
    setTheme((t) => { const n = t === 'light' ? 'dark' : 'light'; localStorage.setItem(KEY, n); return n; });
  }, []);
  return [theme, toggle];
}

/** Вмикає світлу тему для панелі команди (інверсія всього документа). */
export function useInvertedLight(active: boolean) {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('staff-invert', active);
    return () => el.classList.remove('staff-invert');
  }, [active]);
}
