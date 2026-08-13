import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { pickActiveShift } from '@/lib/shift';
import type { Shift } from '@/types/app';

interface ActiveShiftValue {
  shifts: Shift[];
  shiftId: string | null;
  shift: Shift | null;
  loading: boolean;
  setShiftId: (id: string) => void;
  reload: () => Promise<void>;
}

const STORAGE_KEY = 'admin.activeShiftId';

const ActiveShiftContext = createContext<ActiveShiftValue>({
  shifts: [], shiftId: null, shift: null, loading: false,
  setShiftId: () => {}, reload: async () => {},
});

/**
 * Parallel/overlapping shifts: every admin surface reads its `shift_id` from
 * here, so switching a shift re-scopes schedules, children, train, fair and
 * talents instantly — with zero page reloads.
 */
export const ActiveShiftProvider = ({ children }: { children: ReactNode }) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftId, setShiftIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('shifts').select('*').is('deleted_at', null).order('start_date', { ascending: false });
    const list = (data || []) as Shift[];
    setShifts(list);
    setShiftIdState((cur) => {
      if (cur && list.some((s) => s.id === cur)) return cur;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && list.some((s) => s.id === stored)) return stored;
      return pickActiveShift(list)?.id ?? null;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const ch = supabase
      .channel('active-shift-context')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  const setShiftId = useCallback((id: string) => {
    setShiftIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<ActiveShiftValue>(() => ({
    shifts,
    shiftId,
    shift: shifts.find((s) => s.id === shiftId) ?? null,
    loading,
    setShiftId,
    reload,
  }), [shifts, shiftId, loading, setShiftId, reload]);

  return <ActiveShiftContext.Provider value={value}>{children}</ActiveShiftContext.Provider>;
};

export const useActiveShift = () => useContext(ActiveShiftContext);
