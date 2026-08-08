import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, History, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import TransactionDetailsDialog, { receiptNumber, txMerchant, type IronTx } from './TransactionDetailsDialog';

interface Props {
  childId: string;
  /** Rendered without the outer Card wrapper (e.g. inside a dialog tab). */
  bare?: boolean;
  limit?: number;
  /** Render collapsed behind a trigger, expanding into a fixed-height scroll area. */
  collapsible?: boolean;
}

const TransactionHistory = ({ childId, bare = false, limit = 30, collapsible = false }: Props) => {
  const [rows, setRows] = useState<IronTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<IronTx | null>(null);
  const [open, setOpen] = useState(false);
  const haptics = useHaptics();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from('iron_dollar_transactions')
        .select('id, amount_change, balance_after, reason, performed_by, supervisor_user_id, created_at')
        .eq('child_id', childId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (mounted) { setRows((data || []) as IronTx[]); setLoading(false); }
    };
    load();
    const ch = supabase
      .channel(`iron_tx_history:${childId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'iron_dollar_transactions',
        filter: `child_id=eq.${childId}`,
      }, (p) => setRows((prev) => [p.new as IronTx, ...prev].slice(0, limit)))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [childId, limit]);

  const list = (
    <>
      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Операцій ще немає</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((tx) => {
            const negative = tx.amount_change < 0;
            return (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => { haptics.impact('light'); setSelected(tx); }}
                  className="w-full min-h-[56px] flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/25 px-3 py-2.5 text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/40 active:scale-[0.98]"
                >
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      negative ? 'bg-foreground/10 text-foreground' : 'bg-success/15 text-success'
                    }`}
                  >
                    {negative
                      ? <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
                      : <ArrowDownLeft className="w-4 h-4" strokeWidth={2} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{txMerchant(tx)}</span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {receiptNumber(tx.id)} · {new Date(tx.created_at).toLocaleString('uk-UA', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </span>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${negative ? '' : 'text-success'}`}>
                    {tx.amount_change > 0 ? '+' : ''}{tx.amount_change} 💰
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

    </>
  );

  if (collapsible) {
    return (
      <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50">
        <button
          type="button"
          onClick={() => { haptics.impact('light'); setOpen((v) => !v); }}
          className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left transition-smooth active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {open ? 'Приховати історію транзакцій' : 'Показати історію транзакцій'}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.75}
          />
        </button>

        {open && (
          <div className="mt-3 max-h-[260px] overflow-y-auto space-y-2 pr-1 custom-scrollbar rounded-2xl bg-slate-900/60 p-3 border border-slate-800 animate-fade-in">
            {list}
          </div>
        )}

        <TransactionDetailsDialog tx={selected} onClose={() => setSelected(null)} />
      </Card>
    );
  }

  const body = (
    <>
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Історія транзакцій
        </span>
      </div>
      {list}
      <TransactionDetailsDialog tx={selected} onClose={() => setSelected(null)} />
    </>
  );

  if (bare) return <div>{body}</div>;
  return <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50">{body}</Card>;
};

export default TransactionHistory;
