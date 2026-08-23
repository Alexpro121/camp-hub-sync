import { 
  createContext, 
  useCallback, 
  useContext, 
  useEffect, 
  useMemo, 
  useRef, 
  useState, 
  type ReactNode 
} from 'react';
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

const ActiveShiftContext = createContext<ActiveShiftValue | null>(null);

/**
 * Провайдер активної зміни: будь-яка адміністративна чи координаційна поверхня
 * зчитує `shift_id` звідси, тому перемикання зміни миттєво оновлює
 * розклад, списки дітей, купе, ярмарок та таланти без перезавантаження сторінки.
 */
export const ActiveShiftProvider = ({ children }: { children: ReactNode }) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftId, setShiftIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Отримання та оновлення списку змін
  const reload = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .is('deleted_at', null)
        .order('start_date', { ascending: false });

      if (error) throw error;

      const list = (data || []) as Shift[];
      setShifts(list);

      setShiftIdState((currentId) => {
        // 1. Якщо поточна зміна все ще існує в базі
        if (currentId && list.some((s) => s.id === currentId)) {
          return currentId;
        }

        // 2. Якщо збережена зміна є в localStorage
        let storedId: string | null = null;
        try {
          storedId = localStorage.getItem(STORAGE_KEY);
        } catch {
          // Fallback для приватного режиму
        }

        if (storedId && list.some((s) => s.id === storedId)) {
          return storedId;
        }

        // 3. Автоматичний вибір найбільш актуальної зміни
        return pickActiveShift(list)?.id ?? (list[0]?.id || null);
      });
    } catch (err) {
      console.error('[ActiveShiftContext] Помилка завантаження змін:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime слухач з дебаунсом проти спаму
  useEffect(() => {
    reload();

    const handleRealtimeChange = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        reload();
      }, 400);
    };

    const channel = supabase
      .channel('active-shift-context')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, handleRealtimeChange)
      .subscribe();

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [reload]);

  // Ручна зміна активної зміни
  const setShiftId = useCallback((id: string) => {
    setShiftIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Safe fallback
    }
  }, []);

  const value = useMemo<ActiveShiftValue>(() => ({
    shifts,
    shiftId,
    shift: shifts.find((s) => s.id === shiftId) ?? null,
    loading,
    setShiftId,
    reload,
  }), [shifts, shiftId, loading, setShiftId, reload]);

  return (
    <ActiveShiftContext.Provider value={value}>
      {children}
    </ActiveShiftContext.Provider>
  );
};

export const useActiveShift = (): ActiveShiftValue => {
  const ctx = useContext(ActiveShiftContext);
  if (!ctx) {
    throw new Error('useActiveShift must be used inside <ActiveShiftProvider>');
  }
  return ctx;
};
