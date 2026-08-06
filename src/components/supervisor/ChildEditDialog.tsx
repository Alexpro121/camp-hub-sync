import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Coins, Loader2, Save, Minus, Plus } from 'lucide-react';
import type { Child } from '@/types/app';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/useHaptics';
import { useDynamicIsland } from '@/context/DynamicIslandContext';

interface Props {
  child: Child;
  open: boolean;
  onClose: () => void;
}

const ChildEditDialog = ({ child, open, onClose }: Props) => {
  const [phone, setPhone] = useState(child.phone || '');
  const [telegram, setTelegram] = useState(child.telegram_username || '');
  const [notes, setNotes] = useState(child.supervisor_notes || '');
  const [iron, setIron] = useState(String(child.iron_dollars));
  const [saving, setSaving] = useState(false);
  const haptics = useHaptics();
  const island = useDynamicIsland();

  // Auto-save with debounce
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setSaving(true);
      await supabase.from('children').update({
        phone: phone || null,
        telegram_username: telegram || null,
        supervisor_notes: notes || null,
        iron_dollars: parseInt(iron, 10) || 0,
      }).eq('id', child.id);
      setSaving(false);
    }, 800);
    return () => clearTimeout(t);
  }, [phone, telegram, notes, iron, open, child.id]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('children').update({
      phone: phone || null,
      telegram_username: telegram || null,
      supervisor_notes: notes || null,
      iron_dollars: parseInt(iron, 10) || 0,
    }).eq('id', child.id);
    setSaving(false);
    if (error) { toast.error('Помилка'); return; }
    const delta = (parseInt(iron, 10) || 0) - child.iron_dollars;
    if (delta !== 0) {
      island.showSuccess(
        `${delta > 0 ? 'Нараховано' : 'Списано'} ${delta > 0 ? '+' : ''}${delta} Iron Dollars!`,
        child.full_name,
      );
    } else {
      toast.success('Збережено');
    }
    onClose();
  };

  const adjustIron = (delta: number) => {
    haptics.impact('light');
    const cur = parseInt(iron, 10) || 0;
    setIron(String(cur + delta));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="
          bg-gradient-card scrollbar-thin overflow-y-auto
          p-0 gap-0
          max-sm:!max-w-none max-sm:!w-screen max-sm:!h-[100dvh] max-sm:!max-h-[100dvh]
          max-sm:!rounded-none max-sm:!border-0 max-sm:!translate-x-0 max-sm:!translate-y-0
          max-sm:!left-0 max-sm:!top-0
          sm:max-w-md sm:max-h-[90vh] sm:rounded-2xl
        "
      >
        {/* Sticky header */}
        <DialogHeader className="sticky top-0 z-10 px-5 pt-5 pb-3 bg-gradient-card border-b border-border/40 backdrop-blur-sm">
          <DialogTitle className="text-lg sm:text-xl font-black uppercase pr-8 leading-tight">
            {child.full_name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Команда #{child.team_number} · № {child.row_number ?? '—'} {child.team_name && `· ${child.team_name}`}
          </p>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4 pb-32 sm:pb-5">
          {/* Iron dollars with +/- */}
          <div className="p-4 rounded-xl bg-gradient-primary">
            <Label htmlFor="iron" className="text-primary-foreground/90 flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider">
              <Coins className="w-4 h-4" /> Айрон Долари
            </Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustIron(-1)}
                className="h-14 w-14 rounded-xl bg-primary-foreground/15 active:bg-primary-foreground/25 active:scale-95 transition-smooth flex items-center justify-center shrink-0 touch-manipulation"
                aria-label="Зменшити"
              >
                <Minus className="w-6 h-6 text-primary-foreground" />
              </button>
              <Input
                id="iron"
                type="number"
                inputMode="numeric"
                value={iron}
                onChange={(e) => setIron(e.target.value)}
                className="h-14 text-3xl font-black bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/40 tabular-nums text-center"
              />
              <button
                type="button"
                onClick={() => adjustIron(1)}
                className="h-14 w-14 rounded-xl bg-primary-foreground/15 active:bg-primary-foreground/25 active:scale-95 transition-smooth flex items-center justify-center shrink-0 touch-manipulation"
                aria-label="Додати"
              >
                <Plus className="w-6 h-6 text-primary-foreground" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Номер телефону</Label>
            <Input id="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." className="h-12 text-base" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tg">Telegram</Label>
            <Input id="tg" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" className="h-12 text-base" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Замітки</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Особисті нотатки..." className="text-base" />
          </div>

          {/* All raw fields from the imported table */}
          {child.raw_data && typeof child.raw_data === 'object' && Object.keys(child.raw_data).length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-primary/80">Усі поля з таблиці</Label>
              <div className="rounded-lg border border-border/50 bg-surface-1 divide-y divide-border/40">
                {Object.entries(child.raw_data).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 p-2.5 text-xs">
                    <span className="text-muted-foreground min-w-[40%] truncate">{k}</span>
                    <span className="font-medium break-words flex-1">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {child.note_from_table && (
            <div className="text-xs text-muted-foreground bg-surface-1 p-3 rounded-lg border border-border/50">
              <span className="font-semibold">З таблиці:</span> {child.note_from_table}
            </div>
          )}
        </div>

        {/* Sticky save bar (mobile-friendly) */}
        <div className="sticky bottom-0 left-0 right-0 px-5 py-3 bg-gradient-card border-t border-border/40 backdrop-blur-sm">
          <Button onClick={handleSave} className="w-full h-12 font-bold uppercase" disabled={saving}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Зберегти</>}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground mt-1.5">Зміни зберігаються автоматично</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChildEditDialog;
