import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import QrSvg from './QrSvg';
import { FAIR_PRESETS, createFairPayload, formatFairCode } from '@/lib/fair';

/**
 * A4 price-tag sheet. Codes printed here are long-lived reference tags:
 * a fresh set is generated every time the sheet is regenerated.
 */
const AdminPrintQRCodes = () => {
  const [seed, setSeed] = useState(0);

  const tags = useMemo(
    () => FAIR_PRESETS.map((amount) => {
      const payload = createFairPayload({ amount, supervisorName: 'Ярмарок · Залізна зміна' });
      return { amount, payload, value: JSON.stringify(payload) };
    }),
    [seed],
  );

  return (
    <Card className="p-4 border-border/50 bg-card/80 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3 no-print">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Цінники на ярмарок</h3>
          <p className="text-xs text-muted-foreground">Аркуш A4 з QR-кодами на 10–200 Айрон-доларів</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="h-10" onClick={() => setSeed((s) => s + 1)}>
            Оновити коди
          </Button>
          <Button className="h-10" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" strokeWidth={1.9} /> Друк цінників
          </Button>
        </div>
      </div>

      <div id="fair-print-sheet" className="fair-print-sheet grid grid-cols-2 gap-3">
        {tags.map((t) => (
          <div
            key={t.payload.tx_id}
            className="fair-price-tag rounded-2xl border border-border/60 bg-white text-black p-4 flex flex-col items-center"
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-neutral-500">
              Залізна зміна · Ярмарок
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{t.amount}</p>
            <p className="text-[11px] text-neutral-500 mb-2">Айрон-доларів</p>
            <QrSvg value={t.value} size={150} />
            <p className="mt-2 text-[10px] font-mono tracking-[0.16em] text-neutral-500">
              {formatFairCode(t.payload.code)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default AdminPrintQRCodes;