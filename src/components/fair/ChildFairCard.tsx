import { useState } from 'react';
import { Coins, QrCode, ShoppingBag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ApplePayScannerModal from './ApplePayScannerModal';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  balance: number;
  onPaid?: (newBalance: number) => void;
}

const ChildFairCard = ({ balance, onPaid }: Props) => {
  const [open, setOpen] = useState(false);
  const haptics = useHaptics();

  return (
    <>
      <Card className="p-4 mb-3 border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="w-4 h-4 text-primary" strokeWidth={1.75} />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Ярмарок сьогодні
          </span>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold tabular-nums tracking-tight leading-none">{balance}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" strokeWidth={1.75} /> Айрон-доларів доступно
            </p>
          </div>
        </div>

        <Button
          onClick={() => { haptics.impact('medium'); setOpen(true); }}
          className="w-full h-14 mt-4 rounded-2xl text-base font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97]"
        >
          <QrCode className="w-5 h-5 mr-2" strokeWidth={1.9} /> Оплатити покупку (QR)
        </Button>
      </Card>

      <ApplePayScannerModal
        open={open}
        onClose={() => setOpen(false)}
        balance={balance}
        onPaid={onPaid}
      />
    </>
  );
};

export default ChildFairCard;