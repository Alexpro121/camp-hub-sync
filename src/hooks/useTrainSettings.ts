import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { pickActiveShift } from '@/lib/shift';
import type { Shift } from '@/types/app';

export interface TrainSettings {
  shiftId: string | null;
  published: boolean;
  allowSwaps: boolean;
  autoApprove: boolean;
}

const EMPTY: TrainSettings = { shiftId: null, published: false, allowSwaps: false, autoApprove: false };

/** Live train-related flags of the currently relevant shift. */
export const useTrainSettings = () => {
  const [settings, setSettings] = useState<TrainSettings>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('shifts').select('*').is('deleted_at', null);
    const shift = pickActiveShift((data || []) as unknown as Shift[]) as any;
    setSettings(shift
      ? {
          shiftId: shift.id,
          published: !!shift.train_coupes_published,
          allowSwaps: !!shift.allow_coupe_swaps,
          autoApprove: !!shift.auto_approve_swaps,
        }
      : EMPTY);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('train-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shifts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const update = useCallback(async (patch: Partial<Record<'train_coupes_published' | 'allow_coupe_swaps' | 'auto_approve_swaps', boolean>>) => {
    if (!settings.shiftId) return { error: new Error('Немає активної зміни') };
    const { error } = await supabase.from('shifts').update(patch).eq('id', settings.shiftId);
    if (!error) await load();
    return { error };
  }, [settings.shiftId, load]);

  return { settings, loading, reload: load, update };
};