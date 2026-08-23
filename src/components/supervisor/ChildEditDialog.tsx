import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Coins, Loader2, Save, Minus, Plus, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TransactionHistory from '@/components/fair/TransactionHistory';
import type { Child } from '@/types/app';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/useHaptics';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { queuedIronDollarChange, queuedWrite } from '@/lib/offline';

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
  /** Last balance known to be persisted — deltas are computed against it. */
  const baseline = useRef(child.iron_dollars);

  useEffect(() => { baseline.current = child.iron_dollars; }, [child.id, child.iron_dollars]);

  /** Snapshot of the row version this edit session started from (optimistic lock). */
  const clientUpdatedAt = useRef(child.updated_at ?? new Date().toISOString());
  useEffect(() => { clientUpdatedAt.current = child.updated_at ?? new Date().toISOString(); }, [child.id, child.updated_at]);

  const writeProfile = () => queuedWrite({
    table: 'children',
    op: 'update',
    matchId: child.id,
    clientUpdatedAt: clientUpdatedAt.current,
    mergeFields: ['supervisor_notes'],
    label: `Профіль · ${child.full_name}`,
    values: {
      phone: phone || null,
      telegram_username: telegram || null,
      supervisor_notes: notes || null,
    },
  });

  // Auto-save with debounce (profile fields only — the balance is atomic, see below)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setSaving(true);
      await writeProfile();
      setSaving(false);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, telegram, notes, open, child.id]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await writeProfile();
    if (error) { setSaving(false); toast.error('Помилка'); return; }


    // Balance goes through the atomic server function: concurrent supervisors
    // can never overwrite each other, and a retry can never double-credit.
    const delta = (parseInt(iron, 10) || 0) - baseline.current;
    let queued = false;
    if (delta !== 0) {
      const { data: auth } = await supabase.auth.getUser();
      const res = await queuedIronDollarChange({
        childId: child.id,
        amount: delta,
        reason: 'Кабінет супроводу',
        supervisorId: auth?.user?.id ?? null,
        label: `${delta > 0 ? '+' : ''}${delta} IRON · ${child.full_name}`,
      });
      // The server refuses to push a balance below zero — surface it plainly.
      if (/insufficient_funds/.test(String((res.error as any)?.message ?? ''))) {
        setSaving(false);
        setIron(String(baseline.current));
        toast.error('Недостатньо Айрон-доларів на балансі дитини');
        return;
      }
      queued = res.queued;
      baseline.current = parseInt(iron, 10) || 0;
    }

    setSaving(false);

    if (delta !== 0) {
      island.showSuccess(
        `${delta > 0 ? 'Нараховано' : 'Списано'} ${delta > 0 ? '+' : ''}${delta} Iron Dollars!`,
        queued ? `${child.full_name} · збережено офлайн` : child.full_name,
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-foreground/10 hover:bg-foreground/20 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition active:scale-90 z-20"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
          <DialogTitle className="text-lg sm:text-xl font-black uppercase pr-14 leading-tight">
            {child.full_name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Команда №{child.team_number} · № {child.row_number ?? '—'} {child.team_name && `· Категорія: ${child.team_name}`}
          </p>
        </DialogHeader>

        <Tabs defaultValue="edit" className="w-full">
          <div className="px-5 pt-4">
            <TabsList className="grid grid-cols-2 w-full h-11">
              <TabsTrigger value="edit" className="text-xs min-h-[44px]">Дані</TabsTrigger>
              <TabsTrigger value="history" className="text-xs min-h-[44px]">Історія транзакцій</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="history" className="mt-0 px-5 py-4 pb-32 sm:pb-5">
            <TransactionHistory childId={child.id} bare />
          </TabsContent>

          <TabsContent value="edit" className="mt-0">
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
                    <span className="text-muted-foreground min-w-[40%] truncate">
                      {/^команда$/i.test(k.trim()) ? 'Категорія' : k}
                    </span>
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
          </TabsContent>
        </Tabs>

        {/* Sticky save bar (mobile-friendly) */}
        <div className="sticky bottom-0 left-0 right-0 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-gradient-card border-t border-border/40 backdrop-blur-sm">
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
