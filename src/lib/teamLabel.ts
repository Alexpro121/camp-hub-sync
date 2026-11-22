import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionMeta } from '@/lib/session';

/**
 * Підпис команди: у спортивній зміні — «1-СПОРТ», щоб її команди не плутали з командами
 * паралельної звичайної зміни з тими самими номерами. Які зміни спортивні, пам'ятаємо локально
 * (працює офлайн) і оновлюємо з бази при першому показі.
 */

type ShiftKind = { id: string; shift_type?: string | null; shift_category?: string | null };

const KEY = 'helpsuprov:sports-shifts';
const listeners = new Set<() => void>();

const read = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

let sports: string[] = read();

export const isSportsShift = (s?: Omit<ShiftKind, 'id'> | null): boolean =>
  !!s && (s.shift_category === 'sports' || s.shift_type === 'sports');

/** Запам'ятати тип змін із будь-якої відповіді, де він є (список змін, реєстрація, портал). */
export function rememberShiftKinds(shifts: ShiftKind[] | null | undefined): void {
  if (!shifts?.length) return;
  const next = new Set(sports);
  for (const s of shifts) {
    if (!s?.id) continue;
    if (s.shift_type === undefined && s.shift_category === undefined) continue;
    if (isSportsShift(s)) next.add(s.id);
    else next.delete(s.id);
  }
  const arr = [...next].sort();
  if (arr.join() === sports.join()) return;
  sports = arr;
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* quota */ }
  listeners.forEach((l) => l());
}

export const isSportsShiftId = (shiftId?: string | null): boolean => !!shiftId && sports.includes(shiftId);

export const teamLabel = (team: number | string | null | undefined, sportsShift?: boolean): string =>
  team == null || team === '' ? '' : sportsShift ? `${team}-СПОРТ` : String(team);

/** Підпис команди для зміни; без зміни — поточна зміна сесії супроводу. */
export const teamLabelFor = (team: number | string | null | undefined, shiftId?: string | null): string =>
  teamLabel(team, isSportsShiftId(shiftId === undefined ? getSessionMeta()?.shiftId ?? null : shiftId));

let loading: Promise<void> | null = null;
/** Тип змін з бази: персонал бачить усі зміни, дитина — лише свою. Помилки не критичні — лишається кеш. */
export function loadShiftKinds(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const { data } = await supabase.from('shifts').select('id, shift_type, shift_category').is('deleted_at', null);
      rememberShiftKinds(data as ShiftKind[] | null);
    } catch { /* офлайн або немає доступу */ }
  })();
  return loading;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => sports;

/** Функція підпису команди, що перемальовує компонент, коли стає відомо, що зміна спортивна. */
export function useTeamLabel(): (team: number | string | null | undefined, shiftId?: string | null) => string {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void loadShiftKinds(); }, []);
  return teamLabelFor;
}
