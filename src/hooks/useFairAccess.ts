import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  isFairScheduleItem, 
  isFairCurrentlyActive, 
  FAIR_STATUS_UPDATED 
} from '@/lib/fair-resolver';
import { SCHEDULE_CHANNEL, SCHEDULE_UPDATED } from '@/lib/schedule';
import type { ScheduleItem } from '@/types/app';

export interface FairAccess {
  /** Ярмарок присутній у розкладі зміни ➔ вкладка доступна */
  hasFairAccess: boolean;
  /** Торгівля та каса відкриті прямо зараз */
  isLiveFairRunning: boolean;
}

/**
 * Хук постійного доступу до ярмарку та живого статусу торгівлі.
 * Якщо ярмарок опубліковано в розкладі зміни — вкладка залишається доступною,
 * а індикатор живої каси слідує за реальним часом.
 */
export function useFairAccess(enabled = true): FairAccess {
  const [hasFairAccess, setHasFairAccess] = useState(false);
  const [isLiveFairRunning, setIsLiveFairRunning] = useState(false);
  
  const cacheRef = useRef<{ date: string; items: ScheduleItem[] }[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Перерахунок статусу за кешем без запитів до бази
  const recompute = useCallback(() => {
    const running = isFairCurrentlyActive(cacheRef.current, new Date());
    const anyFair = cacheRef.current.some((g) => g.items.some((i) => isFairScheduleItem(i)));
    
    setHasFairAccess(anyFair || running);
    setIsLiveFairRunning(running);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const load = async () => {
      try {
        const { data: schedules, error: schErr } = await supabase
          .from('schedules')
          .select('id, date')
          .eq('is_published', true);

        if (schErr) throw schErr;

        const list = (schedules || []) as { id: string; date: string }[];
        if (!list.length) { 
          cacheRef.current = []; 
          if (mounted) recompute(); 
          return; 
        }

        const { data: items, error: itemErr } = await supabase
          .from('schedule_items')
          .select('*')
          .in('schedule_id', list.map((s) => s.id));

        if (itemErr) throw itemErr;
        if (!mounted) return;

        const rows = (items || []) as unknown as ScheduleItem[];
        const dates = [...new Set(list.map((s) => s.date))];

        cacheRef.current = dates.map((date) => {
          const ids = list.filter((s) => s.date === date).map((s) => s.id);
          return { date, items: rows.filter((i) => ids.includes(i.schedule_id)) };
        });

        recompute();
      } catch (err) {
        console.error('[useFairAccess] Помилка завантаження розкладу ярмарку:', err);
      }
    };

    load();

    // Дебаунс функція для Realtime-оновлень
    const triggerDebouncedLoad = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (mounted) load();
      }, 400);
    };

    // Перевірка часу кожні 10 секунд (економія заряду)
    const ticker = setInterval(recompute, 10000);
    // Фонове оновлення бази кожні 5 хвилин
    const refresh = setInterval(load, 300000);

    // Оновлення при зміні стану авторизації
    const { data: authSub } = supabase.auth.onAuthStateChange(() => { 
      triggerDebouncedLoad(); 
    });

    // Швидкі повторні перевірки після логіну на слабкому інтернеті
    const warmup = [1000, 3000].map((ms) => 
      setTimeout(() => { if (mounted) load(); }, ms)
    );

    // Realtime підписки
    const channel = supabase
      .channel('fair_global_status')
      .on('broadcast', { event: FAIR_STATUS_UPDATED }, triggerDebouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, triggerDebouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, triggerDebouncedLoad)
      .subscribe();

    const live = supabase
      .channel(SCHEDULE_CHANNEL)
      .on('broadcast', { event: SCHEDULE_UPDATED }, triggerDebouncedLoad)
      .subscribe();

    // Оновлення при поверненні користувача на вкладку
    const handleFocus = () => {
      recompute();
      load();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      mounted = false;
      clearInterval(ticker);
      clearInterval(refresh);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      warmup.forEach(clearTimeout);
      authSub.subscription.unsubscribe();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      supabase.removeChannel(channel);
      supabase.removeChannel(live);
    };
  }, [enabled, recompute]);

  return { hasFairAccess, isLiveFairRunning };
}

export default useFairAccess;
