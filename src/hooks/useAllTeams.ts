import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AllTeamsState {
  data: number[];
  loading: boolean;
  error: string | null;
}

/**
 * Every team number that actually exists in the data — read from the shifts'
 * dynamic assigned_teams, with children as a fallback source. No templates.
 * `loading` stays true until the first response, so an empty `data` never means "no teams" prematurely.
 */
export function useAllTeams(): AllTeamsState {
  const [state, setState] = useState<AllTeamsState>({ data: [], loading: true, error: null });

  useEffect(() => {
    let active = true;
    (async () => {
      const [shiftsRes, kidsRes] = await Promise.all([
        supabase.from('shifts').select('assigned_teams, deleted_at'),
        supabase.from('children').select('team_number'),
      ]);
      if (!active) return;
      const set = new Set<number>();
      (shiftsRes.data || [])
        .filter((s: any) => !s.deleted_at)
        .forEach((s: any) => (s.assigned_teams || []).forEach((t: number) => t && set.add(t)));
      (kidsRes.data || []).forEach((c: any) => c.team_number && set.add(c.team_number));
      const err = shiftsRes.error?.message ?? kidsRes.error?.message ?? null;
      setState({ data: [...set].sort((a, b) => a - b), loading: false, error: err });
    })().catch((e) => { if (active) setState((s) => ({ ...s, loading: false, error: e?.message ?? 'failed' })); });
    return () => { active = false; };
  }, []);

  return state;
}
