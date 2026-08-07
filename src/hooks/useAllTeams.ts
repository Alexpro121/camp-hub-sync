import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Every team number that actually exists in the data — read from the shifts'
 * dynamic assigned_teams, with children as a fallback source. No templates.
 */
export function useAllTeams(): number[] {
  const [teams, setTeams] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: shifts }, { data: kids }] = await Promise.all([
        supabase.from('shifts').select('assigned_teams, deleted_at'),
        supabase.from('children').select('team_number'),
      ]);
      if (!active) return;
      const set = new Set<number>();
      (shifts || [])
        .filter((s: any) => !s.deleted_at)
        .forEach((s: any) => (s.assigned_teams || []).forEach((t: number) => t && set.add(t)));
      (kids || []).forEach((c: any) => c.team_number && set.add(c.team_number));
      setTeams([...set].sort((a, b) => a - b));
    })();
    return () => { active = false; };
  }, []);

  return teams;
}
