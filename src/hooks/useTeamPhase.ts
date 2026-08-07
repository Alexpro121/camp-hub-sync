import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Shift } from '@/types/app';
import { resolveTeamShiftStatus, type TeamShiftStatus } from '@/lib/shift-resolver';

/** Resolves the current multi-phase shift status for a given team, live. */
export const useTeamPhase = (teamNumber: number | null) => {
  const [status, setStatus] = useState<TeamShiftStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (teamNumber === null) { setStatus(null); setLoading(false); return; }

    const load = async () => {
      const { data } = await supabase.from('shifts').select('*').order('start_date', { ascending: false });
      if (!mounted) return;
      setStatus(resolveTeamShiftStatus((data || []) as Shift[], teamNumber));
      setLoading(false);
    };

    load();
    const ch = supabase
      .channel(`team-phase-${teamNumber}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => load())
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [teamNumber]);

  return { status, loading };
};