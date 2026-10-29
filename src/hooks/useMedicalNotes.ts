import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MedicalNote } from '@/lib/medical';

export function useMedicalNotes() {
  const [notes, setNotes] = useState<Record<string, MedicalNote>>({});
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return;
      const { data, error } = await supabase.from('child_medical_notes').select('child_id,note,needs_attention,version,updated_at').abortSignal(controller.signal);
      if (!controller.signal.aborted && !error && data) setNotes(Object.fromEntries(data.map((n) => [n.child_id, n])));
    };
    const sync = () => { void load().catch(() => {}); };
    sync();
    const timer = setInterval(sync, 8000);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return notes;
}