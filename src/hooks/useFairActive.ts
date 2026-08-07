import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isFairScheduleActive } from '@/lib/fair';

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Fair mode turns on automatically when today's published agenda contains
 * a fair-like event. Refreshes in realtime and on a slow interval.
 */
export const useFairActive = () => {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: schedules } = await supabase
        .from('schedules')
        .select('id')
        .eq('is_published', true)
        .eq('date', todayISO());
      const ids = (schedules || []).map((s) => s.id);
      if (!ids.length) {
        if (mounted) { setActive(false); setLoading(false); }
        return;
      }
      const { data: items } = await supabase
        .from('schedule_items')
        .select('title, description')
        .in('schedule_id', ids);
      if (!mounted) return;
      setActive(isFairScheduleActive(items || []));
      setLoading(false);
    };

    load();
    const ch = supabase
      .channel('fair-active')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => load())
      .subscribe();
    const t = setInterval(load, 120000);

    return () => { mounted = false; supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  return { active, loading };
};