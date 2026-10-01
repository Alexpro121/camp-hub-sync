import { getSessionMeta } from '@/lib/session';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { pushIsland } from '@/lib/islandBus';

const SEEN_KEY = 'helpsuprov:talent-seen';

/**
 * Talents tab is hidden until an admin starts collecting acts.
 * Returns whether the tab should be visible and whether it is freshly unlocked.
 */
export const useTalentEventActive = () => {
  const [active, setActive] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async (announce = false) => {
      const { data, error: err } = await supabase
        .from('talent_events')
        .select('id, created_at, shift_id')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!mounted) return;
      setLoading(false);
      setError(err?.message ?? null);
      if (err) return; // keep last known state instead of hiding the tab on a failed request
      const myShift = getSessionMeta()?.shiftId ?? null;
      const ev = (data || []).find((e: any) => !myShift || !e.shift_id || e.shift_id === myShift);
      setActive(!!ev);
      if (ev) {
        const seen = localStorage.getItem(SEEN_KEY);
        setIsNew(seen !== ev.id);
        if (announce && seen !== ev.id) {
          pushIsland('Розпочато збір номерів на Вечір Талантів', 'gradient', 'Таланти');
        }
      }
    };

    load();
    const ch = supabase
      .channel('talent-unlock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_events' }, () => load(true))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const markSeen = async () => {
    setIsNew(false);
    const { data } = await supabase
      .from('talent_events')
      .select('id, shift_id')
      .order('created_at', { ascending: false })
      .limit(20);
    const myShift = getSessionMeta()?.shiftId ?? null;
    const ev = (data || []).find((e: any) => !myShift || !e.shift_id || e.shift_id === myShift);
    if (ev) localStorage.setItem(SEEN_KEY, ev.id);
  };

  return { active, isNew, markSeen, loading, error, data: active };
};