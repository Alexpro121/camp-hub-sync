import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight, Check, Loader2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTrainSettings } from '@/hooks/useTrainSettings';
import { tripShort } from '@/lib/trips';

interface SwapRow {
  id: string;
  trip_number: number;
  target_coupe_number: number;
  status: string;
  requester: { full_name: string } | null;
  target: { full_name: string } | null;
}

/** Supervisor controls for child-initiated coupe swaps + pending approvals. */
const CoupeSwapSettings = ({ myTeam }: { myTeam: number | null }) => {
  const { settings, loading, update } = useTrainSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<SwapRow[]>([]);

  const loadPending = useCallback(async () => {
    if (myTeam === null) return;
    const { data } = await supabase
      .from('coupe_swap_requests')
      .select('id, trip_number, target_coupe_number, status, requester:children!coupe_swap_requests_requester_child_id_fkey(full_name), target:children!coupe_swap_requests_target_child_id_fkey(full_name)')
      .eq('team_number', myTeam)
      .eq('status', 'pending_supervisor')
      .order('created_at', { ascending: false });
    setPending((data || []) as unknown as SwapRow[]);
  }, [myTeam]);

  useEffect(() => {
    loadPending();
    const ch = supabase
      .channel('swap-requests-supervisor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coupe_swap_requests' }, () => loadPending())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadPending]);

  const toggle = async (key: 'allow_coupe_swaps' | 'auto_approve_swaps', next: boolean) => {
    setBusy(key);
    const { error } = await update({ [key]: next });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? 'Увімкнено' : 'Вимкнено');
  };

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      if (approve) {
        const { data, error } = await supabase.rpc('execute_coupe_swap', { p_request_id: id });
        if (error) throw error;
        if (!data) throw new Error('Не вдалося виконати заміну');
        toast.success('Заміну підтверджено');
      } else {
        const { error } = await supabase.from('coupe_swap_requests').update({ status: 'rejected' }).eq('id', id);
        if (error) throw error;
        toast.success('Заявку відхилено');
      }
      await loadPending();
    } catch (e: any) {
      toast.error(e.message || 'Помилка');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-3">
      <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="w-4 h-4 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">Пропозиції зміни купе для дітей</p>
            <p className="text-[11px] text-muted-foreground leading-tight">Діти зможуть просити пересадку у своїй команді</p>
          </div>
          {busy === 'allow_coupe_swaps'
            ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
            : <Switch checked={settings.allowSwaps} onCheckedChange={(v) => toggle('allow_coupe_swaps', v)} aria-label="Дозволити зміни купе" />}
        </div>

        <div className="flex items-start gap-3 pt-3 border-t border-border/40">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-primary" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">Автопідтвердження замін</p>
            <p className="text-[11px] text-muted-foreground leading-tight">Місця змінюються миттєво, без участі вожатого</p>
          </div>
          {busy === 'auto_approve_swaps'
            ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
            : <Switch checked={settings.autoApprove} disabled={!settings.allowSwaps} onCheckedChange={(v) => toggle('auto_approve_swaps', v)} aria-label="Автопідтвердження замін" />}
        </div>
      </Card>

      {pending.length > 0 && (
        <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Заявки на підтвердження ({pending.length})
          </p>
          {pending.map((r) => (
            <div key={r.id} className="rounded-lg border border-border/40 bg-muted/25 p-3 space-y-2">
              <p className="text-sm leading-snug break-words">
                <span className="font-medium">{r.requester?.full_name ?? 'Дитина'}</span>
                {r.target?.full_name
                  ? <> ↔ <span className="font-medium">{r.target.full_name}</span></>
                  : <> → вільне місце у купе №{r.target_coupe_number}</>}
              </p>
              <Badge variant="outline" className="text-[9px]">{tripShort(r.trip_number)}</Badge>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" className="h-9 text-xs" disabled={busy === r.id} onClick={() => decide(r.id, true)}>
                  {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" /> Підтвердити</>}
                </Button>
                <Button size="sm" variant="secondary" className="h-9 text-xs" disabled={busy === r.id} onClick={() => decide(r.id, false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Відхилити
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default CoupeSwapSettings;