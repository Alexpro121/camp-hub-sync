import { useCallback, useEffect, useState } from 'react';
import { Printer, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import QrSvg from './QrSvg';
import { FAIR_PRESETS, createReusableFairPayload, FAIR_MAX_AMOUNT } from '@/lib/fair';

interface PresetCode {
  id: string;
  label: string;
  amount: number;
  is_reusable: boolean;
}

/**
 * A4 price-tag sheet backed by `fair_preset_codes`. Every printed QR carries a
 * stable `code_id` with `is_reusable: true`, so one paper tag serves the whole
 * fair — any child, any number of scans.
 */
const AdminPrintQRCodes = () => {
  const [codes, setCodes] = useState<PresetCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fair_preset_codes')
      .select('id,label,amount,is_reusable')
      .order('amount');
    if (error) toast.error(error.message);
    const list = (data || []) as PresetCode[];
    setCodes(list);
    setSelected(new Set(list.map((c) => c.id)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedDefaults = async () => {
    setBusy(true);
    const rows = FAIR_PRESETS.map((a) => ({ label: `${a} Айрон-доларів`, amount: a, is_reusable: true }));
    const { error } = await supabase.from('fair_preset_codes').insert(rows);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Стандартні цінники створено');
    load();
  };

  const create = async () => {
    const value = parseInt(amount.trim(), 10);
    if (!Number.isInteger(value) || value < 1 || value > FAIR_MAX_AMOUNT) {
      toast.error('Ціна має бути цілим числом більше 0'); return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('fair_preset_codes')
      .insert({ label: label.trim() || `${value} Айрон-доларів`, amount: value, is_reusable: true });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setLabel(''); setAmount('');
    toast.success('Цінник створено');
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('fair_preset_codes').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Цінник видалено');
    load();
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toPrint = codes.filter((c) => selected.has(c.id));

  return (
    <div className="space-y-4">
      <Card className="p-4 border-border/50 bg-card/80 backdrop-blur-xl no-print space-y-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Заготовки цінників</h3>
          <p className="text-xs text-muted-foreground">
            Надруковані коди багаторазові — скануються весь день будь-якою дитиною.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5 flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Назва товару <span className="normal-case tracking-normal">(необовʼязково)</span>
            </Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Лимонад (необовʼязково)" className="h-10 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ціна</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              placeholder="35"
              inputMode="numeric"
              className="h-10 w-[92px] text-sm tabular-nums"
            />
          </div>
          <Button onClick={create} disabled={busy} className="h-10">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1.5" /> Створити цінник</>}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : codes.length === 0 ? (
          <div className="space-y-2 py-4 text-center">
            <p className="text-sm text-muted-foreground">Цінників ще немає</p>
            <Button variant="secondary" disabled={busy} onClick={seedDefaults} className="h-10">
              Створити стандартний набір
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {codes.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-border/50 bg-surface-1 p-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 accent-primary"
                  aria-label={`Друкувати ${c.label}`}
                />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{c.label}</p>
                <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">{c.amount} 💰</span>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => remove(c.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button className="w-full h-10 mt-2" disabled={!toPrint.length} onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" strokeWidth={1.9} /> Друк вибраних цінників
            </Button>
          </div>
        )}
      </Card>

      <div id="fair-print-sheet" className="fair-print-sheet print-grid-container grid grid-cols-2 gap-3">
        {toPrint.map((c) => {
          const value = JSON.stringify(createReusableFairPayload({ codeId: c.id, amount: c.amount, label: c.label }));
          return (
            <div
              key={c.id}
              className="fair-price-tag print-price-card rounded-2xl border border-border/60 bg-white text-black p-4 flex flex-col items-center"
            >
              <p className="print-card-header text-[10px] font-medium uppercase tracking-[0.24em] text-neutral-500">
                Залізна зміна · Ярмарок
              </p>
              <p className="print-card-title mt-1 text-lg font-semibold tracking-tight text-center">{c.label}</p>
              <p className="print-card-amount text-4xl font-bold tabular-nums tracking-tight">{c.amount}</p>
              <p className="print-card-footer text-[11px] text-neutral-500 mb-2">Айрон-доларів</p>
              <div className="print-qr-svg"><QrSvg value={value} size={150} /></div>
              <p className="print-card-footer mt-2 text-[10px] uppercase tracking-[0.16em] text-neutral-500">Багаторазовий цінник</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminPrintQRCodes;
