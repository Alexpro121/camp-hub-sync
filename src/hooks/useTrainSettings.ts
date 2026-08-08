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

export const SHIFT_SETTINGS_CHANNEL = 'shift-settings-live';
export const COUPE_SWAPS_TOGGLED = 'COUPE_SWAPS_TOGGLED';

type ShiftFlag = 'train_coupes_published' | 'allow_coupe_swaps' | 'auto_approve_swaps';

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
      .channel(SHIFT_SETTINGS_CHANNEL)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shifts' }, () => load())
      .on('broadcast', { event: COUPE_SWAPS_TOGGLED }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  /** Optimistic write with verification + rollback. Never silently no-ops. */
  const update = useCallback(async (patch: Partial<Record<ShiftFlag, boolean>>) => {
    const shiftId = settings.shiftId;
    if (!shiftId) return { error: new Error('Немає активної зміни') };

    const prev = settings;
    setSettings((s) => ({
      ...s,
      published: patch.train_coupes_published ?? s.published,
      allowSwaps: patch.allow_coupe_swaps ?? s.allowSwaps,
      autoApprove: patch.auto_approve_swaps ?? s.autoApprove,
    }));

    const { data, error } = await supabase
      .from('shifts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', shiftId)
      .select('id, train_coupes_published, allow_coupe_swaps, auto_approve_swaps');

    if (error || !data || data.length === 0) {
      setSettings(prev);
      return { error: error ?? new Error('Немає доступу до збереження налаштувань') };
    }

    const row = data[0] as any;
    setSettings({
      shiftId,
      published: !!row.train_coupes_published,
      allowSwaps: !!row.allow_coupe_swaps,
      autoApprove: !!row.auto_approve_swaps,
    });

    // Live push so children see the swap button appear without reloading.
    try {
      const ch = supabase.channel(SHIFT_SETTINGS_CHANNEL);
      await ch.subscribe();
      await ch.send({
        type: 'broadcast',
        event: COUPE_SWAPS_TOGGLED,
        payload: {
          shift_id: shiftId,
          allow_coupe_swaps: !!row.allow_coupe_swaps,
          auto_approve_swaps: !!row.auto_approve_swaps,
        },
      });
      supabase.removeChannel(ch);
    } catch {
      /* broadcast is best-effort; DB state already persisted */
    }

    return { error: null as null | Error };
  }, [settings]);

  return { settings, loading, reload: load, update };
};