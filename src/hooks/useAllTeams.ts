import { fetchAllRows } from '@/lib/fetchAll';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AllTeamsState {
  data: number[];
  /** Команди кожної зміни (assigned_teams + команди її дітей). */
  byShift: Record<string, number[]>;
  loading: boolean;
  error: string | null;
}

type Loaded = { byShift: Record<string, number[]>; loose: number[]; loading: boolean; error: string | null };

/**
 * Every team number that actually exists in the data — read from the shifts'
 * dynamic assigned_teams, with children as a fallback source. No templates.
 * With `shiftIds`, only those shifts' teams are returned (parallel shifts have distinct numbers).
 * `loading` stays true until the first response, so an empty `data` never means "no teams" prematurely.
 */
export function useAllTeams(enabled = true, shiftIds?: (string | null | undefined)[] | null): AllTeamsState {
  const [state, setState] = useState<Loaded>({ byShift: {}, loose: [], loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) { setState({ byShift: {}, loose: [], loading: false, error: null }); return; }
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [shiftsRes, kidsRes] = await Promise.all([
        supabase.from('shifts').select('id, assigned_teams, deleted_at'),
        fetchAllRows<{ team_number: number; shift_id: string | null }>(() => supabase.from('children').select('team_number, shift_id').is('deleted_at', null).order('id')),
      ]);
      if (!active) return;
      const sets = new Map<string, Set<number>>();
      const loose = new Set<number>();
      const add = (shift: string | null, t: number) => {
        if (!t) return;
        if (!shift) { loose.add(t); return; }
        if (!sets.has(shift)) sets.set(shift, new Set());
        sets.get(shift)!.add(t);
      };
      (shiftsRes.data || [])
        .filter((s: any) => !s.deleted_at)
        .forEach((s: any) => (s.assigned_teams || []).forEach((t: number) => add(s.id, t)));
      (kidsRes.data || []).forEach((c: any) => add(c.shift_id, c.team_number));
      const live = new Set((shiftsRes.data || []).filter((s: any) => !s.deleted_at).map((s: any) => s.id));
      const byShift: Record<string, number[]> = {};
      sets.forEach((v, k) => { if (live.has(k)) byShift[k] = [...v].sort((a, b) => a - b); });
      const err = shiftsRes.error?.message ?? kidsRes.error?.message ?? null;
      setState({ byShift, loose: [...loose].sort((a, b) => a - b), loading: false, error: err });
    })().catch((e) => { if (active) setState((s) => ({ ...s, loading: false, error: e?.message ?? 'failed' })); });
    return () => { active = false; };
  }, [enabled]);

  const filterKey = shiftIds ? shiftIds.filter(Boolean).join(',') : null;
  const data = useMemo(() => {
    const ids = filterKey === null ? Object.keys(state.byShift) : filterKey.split(',').filter(Boolean);
    const set = new Set<number>(filterKey === null || !ids.length ? state.loose : []);
    // Фільтр без жодної відомої зміни (напр. адмін без зміни) — показуємо всі команди.
    const pick = filterKey !== null && ids.length ? ids : Object.keys(state.byShift);
    pick.forEach((id) => (state.byShift[id] ?? []).forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a - b);
  }, [state.byShift, state.loose, filterKey]);

  return { data, byShift: state.byShift, loading: state.loading, error: state.error };
}
