import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Coins, Loader2, Save, Minus, Plus, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Child } from '@/types/app';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { queuedIronDollarChange } from '@/lib/offline';
import type { Gender } from '@/lib/gender';
import type { MedicalNote } from '@/lib/medical';
import { useChildProfileDraft } from './useChildProfileDraft';

const TransactionHistory = lazy(() => import('@/components/fair/TransactionHistory'));
const genderLabels: Record<Gender, string> = { boy: 'Хлопець', girl: 'Дівчина', unknown: 'Не визначено' };
interface Props { child: Child; open: boolean; onClose: () => void; medical?: MedicalNote }

const ChildEditDialog = ({ child, open, onClose, medical }: Props) => {
  const { draft, edit, flush, status, error } = useChildProfileDraft(child, open);
  const [iron, setIron] = useState(String(child.iron_dollars));
  const ironValue = useRef(iron);
  const baseline = useRef(child.iron_dollars);
  const identity = useRef(child.id);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [balanceError, setBalanceError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [tab, setTab] = useState('edit');
  const [light, setLight] = useState(false);
  const haptics = useHaptics();
  const island = useDynamicIsland();
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    try { setLight(localStorage.getItem('helpsuprov:staff-theme') === 'light'); } catch { /* default dark */ }
    setTab('edit');
  }, [open, child.id]);
  useEffect(() => {
    const delta = identity.current === child.id && ironValue.current !== ''
      ? Number(ironValue.current) - baseline.current : 0;
    const value = String(child.iron_dollars + (Number.isSafeInteger(delta) ? delta : 0));
    identity.current = child.id;
    baseline.current = child.iron_dollars;
    ironValue.current = value;
    setIron(value);
    setBalanceError('');
  }, [child.id, child.iron_dollars]);

  const changeIron = (value: string) => {
    ironValue.current = value;
    setIron(value);
    setBalanceError('');
  };
  const saveAndClose = async () => {
    if (saveLock.current) return;
    const balance = Number(ironValue.current);
    if (!ironValue.current.trim() || !Number.isSafeInteger(balance) || balance < 0) {
      setBalanceError('Введіть ціле число, не менше нуля.');
      setTab('edit');
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setBalanceError('');
    try {
      if (!await flush()) return;
      const delta = balance - baseline.current;
      if (delta !== 0) {
        const result = await queuedIronDollarChange({ childId: child.id, amount: delta,
          reason: 'Кабінет супроводу', label: `Баланс: ${child.full_name}` });
        if (result.error && !result.queued) {
          const message = result.error && typeof result.error === 'object' && 'message' in result.error
            ? String(result.error.message) : '';
          setBalanceError(message.includes('insufficient_funds')
            ? 'Недостатньо Айрон-доларів на балансі дитини.' : 'Не вдалося змінити баланс. Спробуйте ще раз.');
          setTab('edit');
          return;
        }
        baseline.current = balance;
        island.showSuccess(delta > 0 ? `Нараховано ${delta} A$` : `Списано ${Math.abs(delta)} A$`,
          result.queued ? 'Збережено на пристрої, очікує синхронізації' : child.full_name);
      }
      onClose();
    } catch {
      setBalanceError('Не вдалося зберегти зміни. Спробуйте ще раз.');
      setTab('edit');
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const detectGender = async () => {
    const id = child.id;
    setDetecting(true);
    try {
      const { data, error: requestError } = await supabase.functions.invoke('detect-gender', { body: { action: 'detect', childId: id } });
      const value: unknown = data?.results?.[id];
      if (requestError || (value !== 'boy' && value !== 'girl' && value !== 'unknown')) throw new Error('invalid gender');
      if (mounted.current && identity.current === id) edit('gender', value);
    } catch {
      if (mounted.current) setBalanceError('Не вдалося визначити стать. Оберіть її вручну.');
    } finally { if (mounted.current) setDetecting(false); }
  };
  const imported = child.raw_data && typeof child.raw_data === 'object' && !Array.isArray(child.raw_data)
    ? Object.entries(child.raw_data as Record<string, unknown>).filter(([, value]) => value != null && String(value).trim()) : [];
  const statusLabel = { saved: 'Збережено', dirty: 'Є зміни', saving: 'Зберігаю…', queued: 'Очікує синхронізації', error: 'Не збережено' }[status];

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) void saveAndClose(); }}>
      <DialogContent hideCloseButton aria-describedby={undefined}
        onEscapeKeyDown={event => { event.preventDefault(); void saveAndClose(); }}
        onPointerDownOutside={event => event.preventDefault()}
        className={`child-profile ${light ? 'staff-light' : ''} !flex flex-col !w-[calc(100dvw-1rem)] !max-w-[520px] min-w-0 max-h-[calc(100dvh-1rem)] !overflow-hidden !rounded-xl border-border bg-background text-foreground !p-0 !gap-0 shadow-elevated`}>
        <DialogHeader className="relative shrink-0 border-b border-border px-5 py-4 text-left">
          <Button variant="ghost" size="icon" className="absolute right-3 top-3 h-11 w-11 rounded-lg hover:bg-muted hover:text-foreground" aria-label="Закрити" title="Зберегти й закрити" onClick={() => void saveAndClose()} disabled={saving || detecting}>
            <X />
          </Button>
          <DialogTitle className="break-words pr-12 text-xl font-semibold !tracking-normal leading-snug">{child.full_name}</DialogTitle>
          <p className="break-words pr-10 text-sm text-muted-foreground">Команда №{child.team_number}{child.team_name ? ` · ${child.team_name}` : ''}</p>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 px-5 pt-3">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-lg bg-muted p-1">
              <TabsTrigger value="edit" className="h-9 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Дані</TabsTrigger>
              <TabsTrigger value="history" className="h-9 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Транзакції</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <TabsContent value="history" className="m-0 min-w-0">
              <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-label="Завантаження транзакцій" />}><TransactionHistory childId={child.id} bare /></Suspense>
            </TabsContent>
            <TabsContent value="edit" className="m-0 min-w-0 space-y-5">
              {medical?.needs_attention && <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="note">
                <h3 className="flex items-center gap-2 text-sm font-semibold !tracking-normal text-destructive"><Plus />Медична помітка лікаря</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{medical.note || 'Потребує уваги супроводу'}</p>
              </section>}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm text-muted-foreground">Номер телефону</Label>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} onChange={event => edit('phone', event.target.value)} disabled={saving} placeholder="+380" className="h-11 rounded-lg bg-background text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tg" className="text-sm text-muted-foreground">Telegram</Label>
                <Input id="tg" value={draft.telegram_username} onChange={event => edit('telegram_username', event.target.value)} disabled={saving} autoCapitalize="none" spellCheck={false} placeholder="@username" className="h-11 rounded-lg bg-background text-base" />
              </div>
              <div data-tour="step-4-notes" className="space-y-2">
                <Label htmlFor="notes" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Замітки
                  {child.notes_origin === 'registry' && (child.supervisor_notes ?? '').trim() && <span className="text-xs font-medium text-warning">з реєстрації</span>}
                </Label>
                <Textarea id="notes" value={draft.supervisor_notes} onChange={event => edit('supervisor_notes', event.target.value)} disabled={saving} rows={3} placeholder="Нотатки супроводу" className="min-h-24 resize-y rounded-lg bg-background text-base" />
              </div>
              <div data-tour="step-4-iron-adjustment" className="border-t border-border pt-4">
                <Label htmlFor="iron" className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Coins className="h-4 w-4" />Айрон-долари</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Зменшити" className="h-11 w-11 shrink-0 rounded-lg hover:bg-muted hover:text-foreground" disabled={saving || Number(iron) <= 0} onClick={() => { haptics.impact('light'); changeIron(String(Math.max(0, (Number(iron) || 0) - 1))); }}><Minus /></Button>
                  <Input id="iron" type="number" min={0} step={1} inputMode="numeric" value={iron} disabled={saving} aria-invalid={!!balanceError} onChange={event => changeIron(event.target.value)} className="h-11 min-w-0 rounded-lg bg-background text-center text-xl font-semibold tabular-nums" />
                  <Button variant="outline" size="icon" aria-label="Додати" className="h-11 w-11 shrink-0 rounded-lg hover:bg-muted hover:text-foreground" disabled={saving} onClick={() => { haptics.impact('light'); changeIron(String((Number(iron) || 0) + 1)); }}><Plus /></Button>
                </div>
              </div>
              <fieldset className="min-w-0 border-t border-border pt-3" disabled={saving || detecting}>
                <legend className="px-0 text-sm text-muted-foreground">Стать</legend>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(genderLabels) as Gender[]).map(value => <Button key={value} variant={draft.gender === value ? 'secondary' : 'ghost'} size="sm" aria-pressed={draft.gender === value} onClick={() => edit('gender', value)} className="h-9 rounded-lg px-2.5 text-xs hover:bg-muted hover:text-foreground">{genderLabels[value]}</Button>)}
                  <Button variant="link" size="sm" onClick={() => void detectGender()} className="h-9 px-1.5 text-xs" disabled={detecting}>{detecting ? 'Визначаю…' : 'Визначити'}</Button>
                </div>
              </fieldset>
              {(imported.length > 0 || child.note_from_table) && <details className="group border-t border-border pt-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Дані з реєстраційної таблиці<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
                {child.note_from_table && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{child.note_from_table}</p>}
                <dl className="mt-3 space-y-3">{imported.map(([key, value]) => <div key={key} className="min-w-0"><dt className="break-words text-xs text-muted-foreground">{/^команда$/i.test(key.trim()) ? 'Категорія' : key}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>
              </details>}
            </TabsContent>
          </div>
        </Tabs>
        <footer className="shrink-0 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {(error || balanceError) && <p role="alert" className="mb-3 break-words text-sm text-destructive">{error || balanceError}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">{status === 'saved' && <Check className="h-3.5 w-3.5" />}{statusLabel}</span>
            <Button onClick={() => void saveAndClose()} disabled={saving || detecting} className="h-11 rounded-lg text-sm font-semibold">{saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Save />}Зберегти й закрити</Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
};
export default ChildEditDialog;
