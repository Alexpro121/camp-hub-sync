import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isFairScheduleItem, isFairCurrentlyActive, FAIR_STATUS_CHANNEL, FAIR_STATUS_UPDATED } from '@/lib/fair-resolver';
import { SCHEDULE_CHANNEL, SCHEDULE_UPDATED } from '@/lib/schedule';
import type { ScheduleItem } from '@/types/app';

export interface FairAccess {
  /** Fair exists in the schedule at all → the tab stays available forever. */
  hasFairAccess: boolean;
  /** The trading window is open right now. */
  isLiveFairRunning: boolean;
}

const dayISO = (delta = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Permanent fair access + live trading status.
 * Once a fair event exists in a published schedule the tab never disappears;
 * only the "cash register open" indicator follows the clock.
 */
export function useFairAccess(enabled = true): FairAccess {
  const [hasFairAccess, setHasFairAccess] = useState(false);
  const [isLiveFairRunning, setIsLiveFairRunning] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    let cache: { date: string; items: ScheduleItem[] }[] = [];

    const recompute = () => {
      if (!mounted) return;
      const running = isFairCurrentlyActive(cache, new Date());
      const anyFair = cache.some((g) => g.items.some((i) => isFairScheduleItem(i)));
      setHasFairAccess(anyFair || running);
      setIsLiveFairRunning(running);
    };

    const load = async () => {
      const { data: schedules } = await supabase
        .from('schedules')
        .select('id, date')
        .eq('is_published', true);
      const list = (schedules || []) as { id: string; date: string }[];
      if (!list.length) { cache = []; recompute(); return; }
      const { data: items } = await supabase
        .from('schedule_items')
        .select('*')
        .in('schedule_id', list.map((s) => s.id));
      if (!mounted) return;
      const rows = (items || []) as unknown as ScheduleItem[];
      const dates = [...new Set(list.map((s) => s.date))];
      cache = dates.map((date) => {
        const ids = list.filter((s) => s.date === date).map((s) => s.id);
        return { date, items: rows.filter((i) => ids.includes(i.schedule_id)) };
      });
      // Live check only makes sense for yesterday/today, the rest just grants access.
      void dayISO;
      recompute();
    };

    load();
    const ticker = setInterval(recompute, 3000);
    const refresh = setInterval(load, 300000);

    const channel = supabase
      .channel('fair_global_status')
      .on('broadcast', { event: FAIR_STATUS_UPDATED }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => load())
      .subscribe();
    const live = supabase
      .channel(SCHEDULE_CHANNEL)
      .on('broadcast', { event: SCHEDULE_UPDATED }, () => load())
      .subscribe();
    void FAIR_STATUS_CHANNEL;

    const onFocus = () => load();
    window.addEventListener('focus', onFocus);

    return () => {
      mounted = false;
      clearInterval(ticker);
      clearInterval(refresh);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
      supabase.removeChannel(live);
    };
  }, [enabled]);

  return { hasFairAccess, isLiveFairRunning };
}
