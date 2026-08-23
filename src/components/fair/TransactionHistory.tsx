import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, History, Loader2, ReceiptText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import TransactionDetailsDialog, { receiptNumber, txMerchant, type IronTx } from './TransactionDetailsDialog';

interface Props {
  childId: string;
  /** Рендер без зовнішньої картки (наприклад, усередині модального вікна) */
  bare?: boolean;
  limit?: number;
  /** Акордеонний режим зі згортанням */
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
      
      if (mounted) { 
        setRows((data || []) as IronTx[]); 
        setLoading(false); 
      }
    };

    load();

    // Realtime підписка на транзакції дитини
    const ch = supabase
      .channel(`iron_tx_history:${childId}`)
      .on('postgres_changes', {
        event: 'INSERT', 
        schema: 'public', 
        table: 'iron_dollar_transactions',
        filter: `child_id=eq.${childId}`,
      }, (p) => {
        const newTx = p.new as IronTx;
        setRows((prev) => {
          if (prev.some(r => r.id === newTx.id)) return prev;
          return [newTx, ...prev].slice(0, limit);
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', 
        schema: 'public', 
        table: 'iron_dollar_transactions',
        filter: `child_id=eq.${childId}`,
      }, (p) => {
        const updatedTx = p.new as IronTx;
        setRows((prev) => prev.map(r => r.id === updatedTx.id ? updatedTx : r));
      })
      .subscribe();

    return () => { 
      mounted = false; 
      supabase.removeChannel(ch); 
    };
  }, [childId, limit]);

  // Список операцій
  const list = (
    <>
      {loading ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2 select-none">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-[11px] text-muted-foreground font-mono">Завантаження історії...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center space-y-1 select-none">
          <ReceiptText className="w-6 h-6 text-muted-foreground/40 mx-auto" />
          <p className="text-xs font-semibold text-foreground">Операцій ще немає</p>
          <p className="text-[10px] text-muted-foreground">Тут з'являться ваші покупки на ярмарку та нарахування</p>
        </div>
      ) : (
        <ul className="space-y-1.5 select-none">
          {rows.map((tx) => {
            const negative = tx.amount_change < 0;
            return (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => { haptics.impact('light'); setSelected(tx); }}
                  className="w-full min-h-[52px] flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface-1/40 hover:bg-muted/50 px-3 py-2 text-left transition-all active:scale-[0.98]"
                >
                  {/* Кругла іконка типу операції */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        negative 
                          ? 'bg-[#FA5A15]/10 border-[#FA5A15]/20 text-[#FA5A15]' 
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                      }`}
                    >
                      {negative
                        ? <ArrowUpRight className="w-4 h-4" strokeWidth={2.2} />
                        : <ArrowDownLeft className="w-4 h-4" strokeWidth={2.2} />}
                    </span>

                    {/* Назва та час */}
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs sm:text-sm font-bold text-foreground truncate">
                        {txMerchant(tx)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground tabular-nums font-medium mt-0.5">
                        {receiptNumber(tx.id)} · {new Date(tx.created_at).toLocaleString('uk-UA', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Сума зміни балансу */}
                  <div className="text-right shrink-0">
                    <span className={`font-mono text-xs sm:text-sm font-black tabular-nums tracking-tight ${
                      negative ? 'text-foreground' : 'text-emerald-500'
                    }`}>
                      {tx.amount_change > 0 ? '+' : ''}{tx.amount_change} <span className="text-[10px] font-sans font-bold text-muted-foreground">А$</span>
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  // Акордеонний режим (для головного екрана кабінету дитини)
  if (collapsible) {
    return (
      <Card className="p-4 bg-card/85 backdrop-blur-md border-border/60 shadow-sm rounded-3xl transition-all">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => { haptics.impact('light'); setOpen((v) => !v); }}
          className="w-full flex items-center justify-between gap-2 min-h-[40px] text-left select-none active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <History className="w-3.5 h-3.5" strokeWidth={2} />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
              {open ? 'Приховати історію транзакцій' : 'Показати історію транзакцій'}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </button>

        {/* Контейнер списку з захистом від зайвого перетягування екрана (overscroll-contain) */}
        {open && (
          <div className="mt-3 max-h-[280px] overflow-y-auto overscroll-contain space-y-2 pr-1 rounded-2xl bg-surface-1/30 p-2.5 border border-border/40 animate-fade-in">
            {list}
          </div>
        )}

        <TransactionDetailsDialog tx={selected} onClose={() => setSelected(null)} />
      </Card>
    );
  }

  // Звичайний блочний режим
  const body = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-border/40 pb-2 select-none">
        <History className="w-4 h-4 text-primary" strokeWidth={2} />
        <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
          Історія транзакцій
        </span>
      </div>
      {list}
      <TransactionDetailsDialog tx={selected} onClose={() => setSelected(null)} />
    </div>
  );

  if (bare) return <div>{body}</div>;
  return <Card className="p-4 bg-card/85 backdrop-blur-md border-border/60 shadow-sm rounded-3xl">{body}</Card>;
};

export default TransactionHistory;
