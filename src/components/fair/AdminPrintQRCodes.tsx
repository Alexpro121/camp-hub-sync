import { useCallback, useEffect, useState } from 'react';
import { 
  Printer, 
  Plus, 
  Trash2, 
  Loader2, 
  ShoppingBag, 
  Store, 
  Tag, 
  Sparkles, 
  Radio, 
  Coins, 
  Check 
} from 'lucide-react';
import { toast } from 'sonner';
import { useActiveShift } from '@/context/ActiveShiftContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { FAIR_PRESETS, FAIR_MAX_AMOUNT } from '@/lib/fair';

interface PresetCode {
  id: string;
  label: string;
  amount: number;
  is_reusable: boolean;
}

/**
 * Панель керування вітриною та прейскурантом ярмарку (Air Pay).
 * Дозволяє налаштовувати товари та друкувати естетичне меню для наметів.
 */
const AdminPrintQRCodes = () => {
  const { shiftId, shift } = useActiveShift();
  const [codes, setCodes] = useState<PresetCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Завантаження позицій вітрини
  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('fair_preset_codes').select('id,label,amount,is_reusable').order('amount');
    if (shiftId) q = q.eq('shift_id', shiftId);
    
    const { data, error } = await q;
    if (error) toast.error(error.message);
    
    const list = (data || []) as PresetCode[];
    setCodes(list);
    setSelected(new Set(list.map((c) => c.id)));
    setLoading(false);
  }, [shiftId]);

  useEffect(() => { 
    load(); 
  }, [load]);

  // Створення стандартного набору товарів/номіналів
  const seedDefaults = async () => {
    setBusy(true);
    const defaultItems = [
      { label: 'Смаколик / Напій', amount: 15 },
      { label: 'Фірмовий Браслет', amount: 25 },
      { label: 'Стікерпак Залізна Зміна', amount: 35 },
      { label: 'Кепка / Бандана', amount: 50 },
      { label: 'Фірмове Худі Iron', amount: 100 },
    ];

    const rows = defaultItems.map((item) => ({ 
      label: item.label, 
      amount: item.amount, 
      is_reusable: true, 
      shift_id: shiftId 
    }));

    const { error } = await supabase.from('fair_preset_codes').insert(rows);
    setBusy(false);
    
    if (error) { 
      toast.error('Не вдалося створити товари'); 
      return; 
    }
    
    toast.success('Стандартну вітрину товарів створено');
    load();
  };

  // Додавання нового товару
  const create = async () => {
    const value = parseInt(amount.trim(), 10);
    if (!Number.isInteger(value) || value < 1 || value > FAIR_MAX_AMOUNT) {
      toast.error('Ціна має бути цілим числом більше 0'); 
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from('fair_preset_codes')
      .insert({ 
        label: label.trim() || `Товар (${value} А$)`, 
        amount: value, 
        is_reusable: true, 
        shift_id: shiftId 
      });
    
    setBusy(false);
    if (error) { 
      toast.error(error.message); 
      return; 
    }

    setLabel(''); 
    setAmount('');
    toast.success('Товар додано до каталогу Air Pay');
    load();
  };

  // Видалення товару
  const remove = async (id: string) => {
    const { error } = await supabase.from('fair_preset_codes').delete().eq('id', id);
    if (error) { 
      toast.error(error.message); 
      return; 
    }
    toast.success('Товар видалено');
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
    <div className="space-y-4 select-none">
      
      {/* ================= КАРТКА РЕДАКТОРА ТОВАРІВ (NO-PRINT) ================= */}
      <Card className="p-4 sm:p-5 border-border/60 bg-card/85 backdrop-blur-xl no-print space-y-4 rounded-3xl shadow-sm">
        
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                Вітрина та прейскурант (Air Pay)
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Позиції автоматично доступні для швидкої оплати
              </p>
            </div>
          </div>

          <Badge variant="outline" className="text-[10px] font-mono font-bold border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            <Radio className="w-2.5 h-2.5 mr-1 animate-pulse" />
            100% AIR PAY
          </Badge>
        </div>

        {/* Форма додавання нового товару */}
        <div className="flex flex-col sm:flex-row items-end gap-2.5 pt-1">
          <div className="space-y-1.5 w-full sm:flex-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Назва товару або послуги
            </Label>
            <Input 
              value={label} 
              onChange={(e) => setLabel(e.target.value)} 
              placeholder="Наприклад: Лимонад, Кепка, Браслет..." 
              className="h-11 text-xs sm:text-sm bg-surface-1/50 border-border/60 rounded-xl" 
            />
          </div>

          <div className="space-y-1.5 w-full sm:w-32">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Ціна (А$)
            </Label>
            <div className="relative">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="25"
                inputMode="numeric"
                className="h-11 pr-8 text-xs sm:text-sm font-mono font-bold bg-surface-1/50 border-border/60 rounded-xl"
              />
              <span className="absolute right-3 top-3 text-xs font-bold text-muted-foreground">А$</span>
            </div>
          </div>

          <Button 
            onClick={create} 
            disabled={busy || !amount} 
            className="w-full sm:w-auto h-11 px-4 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-md active:scale-95 transition-all shrink-0"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4 mr-1.5" /> 
                <span>Додати товар</span>
              </>
            )}
          </Button>
        </div>

        {/* Список товарів */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : codes.length === 0 ? (
          <div className="space-y-3 py-6 text-center bg-surface-1/30 rounded-2xl border border-dashed border-border/60 p-4">
            <Store className="w-8 h-8 text-muted-foreground/50 mx-auto" />
            <p className="text-xs font-semibold text-foreground">Вітрина ярмарку порожня</p>
            <Button 
              variant="secondary" 
              disabled={busy} 
              onClick={seedDefaults} 
              className="h-10 text-xs font-bold rounded-xl"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary" />
              Створити стандартний набір товарів
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {codes.map((c) => (
                <div 
                  key={c.id} 
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface-1/40 hover:bg-muted/40 p-2.5 px-3.5 transition-all text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                      aria-label={`Включити ${c.label} у прейскурант`}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate">{c.label}</p>
                      <span className="text-[10px] text-muted-foreground font-mono">Air Pay позиція</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-sm font-black text-primary tabular-nums">
                      {c.amount} А$
                    </span>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive active:scale-90" 
                      onClick={() => remove(c.id)}
                      title="Видалити"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Кнопка друку стенду цін */}
            <Button 
              className="w-full h-11 mt-2 bg-surface-1 hover:bg-muted/60 text-foreground border border-border/60 rounded-xl font-bold text-xs active:scale-[0.98] transition-all" 
              disabled={!toPrint.length} 
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4 mr-2 text-primary" strokeWidth={2} /> 
              <span>Друк стендового прейскуранта (A4 Меню)</span>
            </Button>
          </div>
        )}
      </Card>

      {/* ================= СТИЛЬНИЙ ДРУКОВАНИЙ СТЕНД / ПРЕЙСКУРАНТ (ДЛЯ НАМЕТУ) ================= */}
      <div id="fair-print-sheet" className="fair-print-sheet print-grid-container grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
        {toPrint.map((c) => (
          <div
            key={c.id}
            className="fair-price-tag print-price-card rounded-3xl border-2 border-slate-200 bg-white text-slate-900 p-5 flex flex-col justify-between shadow-sm relative overflow-hidden"
          >
            {/* Шапка цінника */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 font-mono">
                ЗАЛІЗНА ЗМІНА · ЯРМАРОК
              </span>
              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-[#FA5A15] text-[9px] font-bold">
                AIR PAY
              </span>
            </div>

            {/* Назва товару */}
            <div className="my-4 text-center">
              <p className="text-base sm:text-lg font-black tracking-tight text-slate-900 leading-snug">
                {c.label}
              </p>
              
              {/* Велика ціна в Айрон-доларах */}
              <div className="mt-2 flex items-baseline justify-center gap-1 font-mono">
                <span className="text-4xl sm:text-5xl font-black text-[#FA5A15] tracking-tight">{c.amount}</span>
                <span className="text-sm font-sans font-bold text-slate-500">А$</span>
              </div>
            </div>

            {/* Нижня підказка для дітей */}
            <div className="pt-2 border-t border-slate-100 text-center">
              <p className="text-[10px] font-medium text-slate-500">
                Оплата в 1 клік через кабінет учасника
              </p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default AdminPrintQRCodes;
