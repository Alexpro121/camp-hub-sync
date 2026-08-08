import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resolveFairWindowFromItems, type FairWindow } from '@/lib/fair-resolver';
import type { ScheduleItem } from '@/types/app';

const dayISO = (delta = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

/**
 * Global fair mode. Active strictly from the fair event start until its overall
 * end — never toggled by UI/banner dismissal, tab switches or refetches.
 */
export const useFairActive = () => {
  const [window_, setWindow] = useState<FairWindow>({ active: false, endsAt: null, startsAt: null });
  const [loading, setLoading] = useState(true);
  /** Last successfully loaded rows: keeps the state stable across refetches. */
  const cache = useRef<{ date: string; items: ScheduleItem[] }[]>([]);
  /** Sticky end timestamp — mode stays on until this moment passes. */
  const stickyEnd = useRef<number | null>(null);

  const recompute = useCallback(() => {
    const w = resolveFairWindowFromItems(cache.current);
    if (w.active) stickyEnd.current = w.endsAt;
    const sticky = stickyEnd.current;
    if (!w.active && sticky && Date.now() < sticky) {
      setWindow({ active: true, endsAt: sticky, startsAt: null });
      return;
    }
    if (sticky && Date.now() >= sticky) stickyEnd.current = null;
    setWindow(w);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const dates = [dayISO(-1), dayISO(0)];
      const { data: schedules } = await supabase
        .from('schedules')
        .select('id, date')
        .eq('is_published', true)
        .in('date', dates);
      const list = (schedules || []) as { id: string; date: string }[];
      if (!list.length) {
        if (mounted) { cache.current = []; recompute(); setLoading(false); }
        return;
      }
      const { data: items } = await supabase
        .from('schedule_items')
        .select('*')
        .in('schedule_id', list.map((s) => s.id));
      if (!mounted) return;
      const rows = (items || []) as unknown as ScheduleItem[];
      cache.current = dates.map((date) => {
        const ids = list.filter((s) => s.date === date).map((s) => s.id);
        return { date, items: rows.filter((i) => ids.includes(i.schedule_id)) };
      });
      recompute();
      setLoading(false);
    };

    load();
    const ch = supabase
      .channel('fair-active')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => load())
      .subscribe();
    // Time-driven ticks keep the window exact to the minute without refetching.
    const tick = setInterval(recompute, 15000);
    const refresh = setInterval(load, 300000);

    return () => { mounted = false; supabase.removeChannel(ch); clearInterval(tick); clearInterval(refresh); };
  }, [recompute]);

  return { active: window_.active, endsAt: window_.endsAt, startsAt: window_.startsAt, loading };
};
