import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'off' | 'gender_mismatch' | 'all';
interface Req { id: string; kind: string; summary: string; gender_mismatch: boolean; requested_label: string | null; created_at: string; }

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'off', label: 'Вимкнено', hint: 'Супровід переводить одразу' },
  { id: 'gender_mismatch', label: 'Різна стать', hint: 'Лише заміни дівчинка ⇄ хлопець' },
  { id: 'all', label: 'Усі', hint: 'Кожне переведення й заміна' },
];

const AdminTransferApprovals = () => {
  const [mode, setMode] = useState<Mode>('off');
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const db = supabase as any;

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }] = await Promise.all([
      db.from('app_settings').select('value').eq('key', 'transfer_approval').maybeSingle(),
      db.from('transfer_requests').select('id,kind,summary,gender_mismatch,requested_label,created_at').eq('status', 'pending').order('created_at'),
    ]);
    if (s?.value) setMode(s.value as Mode);
    setReqs((r || []) as Req[]);
  }, [db]);

  useEffect(() => {
    load();
    const ch = supabase.channel('admin-transfer-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfer_requests' }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const saveMode = async (m: Mode) => {
    const prev = mode; setMode(m);
    const { error } = await db.from('app_settings').upsert({ key: 'transfer_approval', value: m, updated_at: new Date().toISOString() });
    if (error) { setMode(prev); toast.error('Не вдалося зберегти'); } else toast.success('Налаштування збережено');
  };

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    const { error } = await db.rpc('review_transfer_request', { p_request_id: id, p_approve: approve });
    setBusy(null);
    if (error) {
      if (/forbidden/i.test(error.message)) {
        toast.error('У цьому браузері зараз активний вхід супроводу, а не адміна. Вийдіть і увійдіть як адмін ще раз.', { duration: 8000 });
      } else toast.error('Помилка: ' + error.message);
      return;
    }
    toast.success(approve ? 'Підтверджено' : 'Відхилено');
    setReqs((r) => r.filter((x) => x.id !== id));
  };

  return (
    <Card className="p-4 space-y-3 bg-gradient-card">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <p className="font-bold text-sm">Підтвердження переведень</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => saveMode(m.id)}
            className={`rounded-lg border p-2 text-left transition-smooth ${mode === m.id ? 'border-primary bg-primary/10' : 'border-border/40 bg-surface-1'}`}>
            <p className="text-xs font-bold">{m.label}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{m.hint}</p>
          </button>
        ))}
      </div>
      {reqs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Немає запитів на підтвердження</p>
      ) : (
        <div className="space-y-2">
          {reqs.map((r) => (
            <div key={r.id} className="rounded-lg border border-border/40 bg-surface-1 p-3 space-y-2">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{r.kind === 'swap' ? 'Заміна: ' : 'Переведення: '}{r.summary}</p>
                <p className="text-[11px] text-muted-foreground">{r.requested_label || 'Супровід'} · {new Date(r.created_at).toLocaleString('uk-UA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>
                {r.gender_mismatch && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-warning"><AlertTriangle className="w-3 h-3" /> Різна стать дітей</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => review(r.id, false)}><X className="w-4 h-4 mr-1" /> Відхилити</Button>
                <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, true)}>
                  {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Підтвердити</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default AdminTransferApprovals;
