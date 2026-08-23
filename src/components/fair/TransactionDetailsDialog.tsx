import { memo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ReceiptText, CheckCircle2, ArrowUpRight, ArrowDownLeft, Copy } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import { toast } from 'sonner';

export interface IronTx {
  id: string;
  amount_change: number;
  balance_after: number | null;
  reason: string | null;
  performed_by?: string | null;
  supervisor_user_id?: string | null;
  created_at: string;
}

/** Генерація стабільного читабельного номера чека */
export const receiptNumber = (id: string) => {
  const digits = id.replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  return `#AP-${digits}`;
};

/** Визначення назви точки або відправника */
export const txMerchant = (tx: IronTx) => {
  if (tx.reason?.includes('Air Pay')) return tx.reason;
  if (tx.reason === 'Ярмарок' || tx.reason === 'Покупка на ярмарку') return 'Ярмарок · Залізна зміна';
  return tx.performed_by || tx.reason || 'Супровід';
};

/** Форматування дати та часу */
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

const Row = ({ 
  label, 
  value, 
  mono, 
  onClick 
}: { 
  label: string; 
  value: string; 
  mono?: boolean; 
  onClick?: () => void; 
}) => (
  <div 
    onClick={onClick}
    className={`flex items-center justify-between gap-4 py-2.5 ${onClick ? 'cursor-pointer active:opacity-70 transition-opacity' : ''}`}
  >
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span className={`text-xs font-semibold text-right break-words text-foreground flex items-center gap-1.5 ${mono ? 'font-mono tabular-nums' : ''}`}>
      {value}
      {onClick && <Copy className="w-3 h-3 text-muted-foreground" />}
    </span>
  </div>
);

const TransactionDetailsDialog = memo(({ tx, onClose }: Props) => {
  const haptics = useHaptics();

  if (!tx) return null;

  const isIncome = tx.amount_change > 0;
  const formattedReceipt = receiptNumber(tx.id);

  const handleCopyReceipt = () => {
    navigator.clipboard.writeText(formattedReceipt);
    haptics.impact('light');
    toast.success(`Номер чека ${formattedReceipt} скопійовано`);
  };

  return (
    <Dialog open={!!tx} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 gap-0 overflow-hidden rounded-[32px] sm:max-w-sm border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl [&>button]:hidden select-none">
        <div className="relative">
          
          {/* Кнопка закриття */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити чек"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-foreground/5 hover:bg-foreground/15 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition-all active:scale-90 z-10 border border-border/40"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>

          {/* Верхня частина чека */}
          <div className="px-6 pt-7 pb-5 text-center border-b border-dashed border-border/60 relative">
            
            {/* Іконка операції */}
            <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-2.5 shadow-inner border border-border/40 bg-surface-1/60">
              {isIncome ? (
                <ArrowDownLeft className="w-6 h-6 text-emerald-500" strokeWidth={2.2} />
              ) : (
                <ArrowUpRight className="w-6 h-6 text-[#FA5A15]" strokeWidth={2.2} />
              )}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              {isIncome ? 'Нарахування коштів' : 'Чек оплати'}
            </p>

            {/* Велика сума */}
            <p className={`mt-2 text-4xl sm:text-5xl font-black font-mono tracking-tight tabular-nums ${
              isIncome ? 'text-emerald-500' : 'text-foreground'
            }`}>
              {isIncome ? '+' : ''}{tx.amount_change} <span className="text-xl font-sans font-bold text-muted-foreground">А$</span>
            </p>

            <p className="mt-1 text-xs font-semibold text-muted-foreground truncate max-w-[240px] mx-auto">
              {txMerchant(tx)}
            </p>
          </div>

          {/* Рядки деталей чека */}
          <div className="px-6 py-3 divide-y divide-border/30 text-xs">
            <Row 
              label="Номер чека" 
              value={formattedReceipt} 
              mono 
              onClick={handleCopyReceipt} 
            />
            <Row label="Дата та час" value={txDateTime(tx.created_at)} mono />
            <Row label="Призначення" value={tx.reason || 'Операція на ярмарку'} />
            <Row label="Отримувач / Каса" value={txMerchant(tx)} />
            
            {typeof tx.balance_after === 'number' && (
              <Row 
                label="Залишок після операції" 
                value={`${tx.balance_after} А$`} 
                mono 
              />
            )}
          </div>

          {/* Нижня кнопка "Готово" */}
          <div className="px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2">
            <Button 
              onClick={onClose} 
              className="w-full h-12 rounded-2xl font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-all shadow-md"
            >
              Готово
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
});

TransactionDetailsDialog.displayName = 'TransactionDetailsDialog';

export default TransactionDetailsDialog;
