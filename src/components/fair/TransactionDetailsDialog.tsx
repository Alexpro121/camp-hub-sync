import { memo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface IronTx {
  id: string;
  amount_change: number;
  balance_after: number | null;
  reason: string | null;
  performed_by?: string | null;
  supervisor_user_id?: string | null;
  created_at: string;
}

/** Stable, human-friendly receipt number derived from the transaction id. */
export const receiptNumber = (id: string) => {
  const digits = id.replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  return `#AP-${digits}`;
};

export const txMerchant = (tx: IronTx) => {
  if (tx.reason === 'Ярмарок') return 'Ярмарок · Залізна зміна';
  return tx.performed_by || tx.reason || 'Супровід';
};

export const txDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date} • ${time}`;
};

interface Props {
  tx: IronTx | null;
  onClose: () => void;
}

const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <span className="text-[13px] text-muted-foreground shrink-0">{label}</span>
    <span className={`text-[13px] font-semibold text-right break-words ${mono ? 'font-mono tabular-nums' : ''}`}>
      {value}
    </span>
  </div>
);

const TransactionDetailsDialog = memo(({ tx, onClose }: Props) => (
  <Dialog open={!!tx} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="p-0 gap-0 overflow-hidden rounded-[28px] sm:max-w-sm border-border/50 bg-card/95 backdrop-blur-2xl">
      {tx && (
        <div className="relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-foreground/10 hover:bg-foreground/20 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition active:scale-90 z-10"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>

          <div className="px-6 pt-8 pb-6 text-center border-b border-dashed border-border/60">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Чек операції
            </p>
            <p
              className={`mt-3 text-4xl font-bold tabular-nums tracking-tight ${
                tx.amount_change < 0 ? 'text-foreground' : 'text-success'
              }`}
            >
              {tx.amount_change > 0 ? '+' : ''}{tx.amount_change} 💰
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{txMerchant(tx)}</p>
          </div>

          <div className="px-6 py-3 divide-y divide-border/40">
            <Row label="Номер транзакції" value={receiptNumber(tx.id)} mono />
            <Row label="Дата та час" value={txDateTime(tx.created_at)} mono />
            <Row label="Отримувач" value={txMerchant(tx)} />
            <Row label="Причина" value={tx.reason || 'Покупка на ярмарку'} />
            {typeof tx.balance_after === 'number' && (
              <Row label="Баланс після" value={`${tx.balance_after} 💰`} mono />
            )}
          </div>

          <div className="px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2">
            <Button onClick={onClose} className="w-full h-12 rounded-2xl font-semibold">
              Готово
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
));
TransactionDetailsDialog.displayName = 'TransactionDetailsDialog';

export default TransactionDetailsDialog;
