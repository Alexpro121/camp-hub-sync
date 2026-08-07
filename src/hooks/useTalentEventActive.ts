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

  useEffect(() => {
    let mounted = true;

    const load = async (announce = false) => {
      const { data } = await supabase
        .from('talent_events')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!mounted) return;
      const ev = data?.[0];
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
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);
    if (data?.[0]) localStorage.setItem(SEEN_KEY, data[0].id);
  };

  return { active, isNew, markSeen };
};