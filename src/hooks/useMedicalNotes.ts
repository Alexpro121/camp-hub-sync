import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MedicalNote } from '@/lib/medical';

export function useMedicalNotes() {
  const [notes, setNotes] = useState<Record<string, MedicalNote>>({});
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading || !navigator.onLine || document.visibilityState === 'hidden') return;
      loading = true;
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 10000);
      try {
        const { data, error } = await supabase.from('child_medical_notes').select('child_id,note,needs_attention,version,updated_at').abortSignal(request.signal);
        if (!controller.signal.aborted && !error && data) setNotes(Object.fromEntries(data.map((n) => [n.child_id, n])));
        else if (!controller.signal.aborted && error?.code === '42501') setNotes({});
      } finally { loading = false; clearTimeout(timer); controller.signal.removeEventListener('abort', abort); }
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