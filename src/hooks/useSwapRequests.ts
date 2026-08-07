import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDynamicIsland } from '@/context/DynamicIslandContext';

export interface IncomingSwap {
  id: string;
  trip_number: number;
  target_coupe_number: number;
  status: string;
  requester_child_id: string;
  requester: { full_name: string } | null;
}

const SELECT =
  'id, trip_number, target_coupe_number, status, requester_child_id, requester:children!coupe_swap_requests_requester_child_id_fkey(full_name)';

/**
 * Watches swap requests addressed to this child (peer offers) and announces
 * every status change of their own requests in the Dynamic Island.
 */
export const useSwapRequests = (childId: string | null, autoApprove: boolean) => {
  const island = useDynamicIsland();
  const [incoming, setIncoming] = useState<IncomingSwap[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!childId) { setIncoming([]); return; }
    const { data } = await supabase
      .from('coupe_swap_requests')
      .select(SELECT)
      .eq('target_child_id', childId)
      .eq('status', 'pending_peer')
      .order('created_at', { ascending: false });
    setIncoming((data || []) as unknown as IncomingSwap[]);
  }, [childId]);

  useEffect(() => {
    if (!childId) return;
    load();
    const ch = supabase
      .channel(`swaps-${childId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'coupe_swap_requests' }, async (p) => {
        const r = p.new as any;
        if (r.target_child_id === childId) {
          const { data } = await supabase.from('children').select('full_name').eq('id', r.requester_child_id).maybeSingle();
          island.showBroadcast('purple', `${data?.full_name ?? 'Хтось'} пропонує помінятися купе`, 'Потяг');
          load();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'coupe_swap_requests' }, (p) => {
        const r = p.new as any;
        if (r.requester_child_id !== childId && r.target_child_id !== childId) return;
        if (r.status === 'approved') island.showSuccess('Заміну купе підтверджено', `Купе №${r.target_coupe_number}`);
        if (r.status === 'rejected') island.showError('Заміну купе відхилено');
        if (r.status === 'pending_supervisor' && r.requester_child_id === childId) {
          island.showSuccess('Обмін прийнято', 'Очікуємо підтвердження вожатого');
        }
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [childId, island, load]);

  const respond = useCallback(async (id: string, accept: boolean) => {
    setBusy(id);
    try {
      if (!accept) {
        await supabase.from('coupe_swap_requests').update({ status: 'rejected' }).eq('id', id);
      } else if (autoApprove) {
        const { error } = await supabase.rpc('execute_coupe_swap', { p_request_id: id });
        if (error) throw error;
      } else {
        await supabase.from('coupe_swap_requests').update({ status: 'pending_supervisor' }).eq('id', id);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }, [autoApprove, load]);

  return { incoming, respond, busy, reload: load };
};