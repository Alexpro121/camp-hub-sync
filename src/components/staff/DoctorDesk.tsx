import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Cross, LogOut, RefreshCw, Search, Stethoscope, Sun, Moon, Users, Phone, ChevronRight, X, ClipboardList, Check, Loader2, HelpCircle } from 'lucide-react';
import DoctorTour, { DOCTOR_TOUR_KEY } from './DoctorTour';
import ExitConfirm from '@/components/ExitConfirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { staffCall } from '@/lib/staffApi';
import { buildIndex, searchItems } from '@/lib/registrySearch';
import { MedicalDraftSchema, supervisorsForChild, type MedicalNote, type MedicalAssignment } from '@/lib/medical';
import type { Child } from '@/types/app';
import { toast } from 'sonner';

interface DeskData { children: Child[]; shifts: { id: string; name: string }[]; assignments: MedicalAssignment[]; medical: MedicalNote[] }
interface Props { name: string; theme: string; toggleTheme: () => void; onLogout: () => void }

export default function DoctorDesk({ name, theme, toggleTheme, onLogout }: Props) {
  const [data, setData] = useState<DeskData | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [shift, setShift] = useState('all');
  const [marked, setMarked] = useState(false);
  const [limit, setLimit] = useState(60);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(() => { try { return !localStorage.getItem(DOCTOR_TOUR_KEY); } catch { return false; } });
  const deferredQuery = useDeferredValue(query);
  const loadingRef = useRef(false);
  const revision = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const startRevision = revision.current;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 15000);
    try { const d = await staffCall<DeskData>({ action: 'doctor_data' }, { signal: controller.signal }); if (!signal?.aborted && startRevision === revision.current) { setData(d); setError(false); } }
    catch (e) { if (!signal?.aborted) { setError(true); if (e instanceof Error && ['forbidden', 'unauthorized'].includes(e.message)) { setData(null); setOpenId(null); onLogout(); } } }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); loadingRef.current = false; }
  }, [onLogout]);
  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    const sync = () => { if (navigator.onLine && document.visibilityState === 'visible') void load(ac.signal); };
    const timer = setInterval(sync, 20000);
    window.addEventListener('online', sync); document.addEventListener('visibilitychange', sync);
    return () => { ac.abort(); clearInterval(timer); window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', sync); };
  }, [load]);
  useEffect(() => { setLimit(60); }, [deferredQuery, shift, marked]);
  const medical = useMemo(() => Object.fromEntries((data?.medical ?? []).map((n) => [n.child_id, n])), [data?.medical]);
  const indexes = useMemo(() => new Map((data?.children ?? []).map((c) => [c.id, buildIndex(c.full_name, c.phone)])), [data?.children]);
  const visible = useMemo(() => {
    const list = (data?.children ?? []).filter((c) => (shift === 'all' || c.shift_id === shift) && (!marked || medical[c.id]?.needs_attention));
    return deferredQuery.trim() ? searchItems(list, (c) => indexes.get(c.id) ?? buildIndex(c.full_name, c.phone), deferredQuery, list.length) : list;
  }, [data?.children, shift, marked, medical, indexes, deferredQuery]);
  const child = data?.children.find((c) => c.id === openId);
  const save = async (note: string, attention: boolean, version: number) => {
    if (!child) return;
    const body = MedicalDraftSchema.parse({ child_id: child.id, note, needs_attention: attention, version });
    const result = await staffCall<{ medical: MedicalNote }>({ action: 'doctor_save', ...body });
    revision.current += 1;
    setData((d) => d ? { ...d, medical: [...d.medical.filter((n) => n.child_id !== child.id), result.medical] } : d);
    toast.success('Медичну помітку збережено'); setOpenId(null);
  };
  const markedCount = (data?.children ?? []).filter((c) => (shift === 'all' || c.shift_id === shift) && medical[c.id]?.needs_attention).length;
  const childCount = (data?.children ?? []).filter((c) => shift === 'all' || c.shift_id === shift).length;
  return <main className={`doctor-desk min-h-[100dvh] bg-background text-foreground ${theme === 'light' ? 'staff-light' : ''}`}>
    <DoctorTour open={tourOpen} onClose={() => setTourOpen(false)} actions={{ openFirstChild: () => { const f = visible[0] ?? data?.children[0]; if (f) setOpenId(f.id); }, closeChild: () => setOpenId(null), setMarked }} />
    <header data-doctor-tour="header" className="border-b border-border bg-card px-3 pt-3 pb-3 sm:px-6 sm:pt-7 sm:pb-4 safe-top">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Stethoscope className="h-5 w-5 sm:h-6 sm:w-6" /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-medium text-primary">Медичний кабінет</p><h1 className="text-lg font-bold leading-tight tracking-normal sm:text-2xl">Лікар</h1></div>
          <Button size="icon" variant="ghost" className="shrink-0 hover:bg-muted hover:text-foreground" data-doctor-tour="help" onClick={() => setTourOpen(true)} aria-label="Інструктаж" title="Інструктаж"><HelpCircle /></Button>
          <Button size="icon" variant="ghost" className="shrink-0 hover:bg-muted hover:text-foreground" onClick={toggleTheme} aria-label="Змінити тему" title="Змінити тему">{theme === 'light' ? <Moon /> : <Sun />}</Button>
          <ExitConfirm onConfirm={onLogout}>
            <Button size="icon" variant="ghost" className="shrink-0 hover:bg-muted hover:text-foreground" aria-label="Вийти" title="Вийти"><LogOut /></Button>
          </ExitConfirm>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2 sm:mt-4 sm:pt-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground sm:text-sm">{name}</p>
          <div className="flex items-center gap-4 text-xs sm:text-sm"><span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-4 w-4" /><strong className="font-semibold text-foreground">{data ? childCount : '—'}</strong> дітей</span><span className="flex items-center gap-1.5 text-destructive"><Cross className="h-4 w-4" /><strong className="font-semibold">{data ? markedCount : '—'}</strong> з поміткою</span></div>
        </div>
      </div>
    </header>
    <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2.5 sm:bg-background sm:px-6 sm:py-4">
      <div className="mx-auto max-w-5xl space-y-2 sm:space-y-3">
        <div data-doctor-tour="search" className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" /><Input aria-label="Пошук дитини" placeholder="ПІБ або телефон" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} value={query} onChange={(e) => setQuery(e.target.value)} className="h-12 rounded-lg bg-card pl-11 pr-11 text-base" />{query && <Button variant="ghost" size="icon" aria-label="Очистити пошук" title="Очистити пошук" onClick={() => setQuery('')} className="absolute right-1 top-1 hover:bg-muted hover:text-foreground"><X /></Button>}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap"><Select value={shift} onValueChange={setShift}><SelectTrigger data-doctor-tour="shift" className="h-11 w-full min-w-0 bg-card text-sm sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Усі зміни</SelectItem>{data?.shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          <div className="flex h-11 rounded-md border border-border bg-muted p-1" role="group" aria-label="Фільтр дітей" data-doctor-tour="marked">
            <Button variant="ghost" aria-pressed={!marked} className={`h-9 px-2.5 sm:px-3 hover:bg-card hover:text-foreground ${!marked ? 'bg-card text-foreground' : 'text-muted-foreground'}`} onClick={() => setMarked(false)}>Усі</Button>
            <Button variant="ghost" aria-pressed={marked} className={`h-9 gap-1 px-2.5 sm:px-3 hover:bg-card hover:text-destructive ${marked ? 'bg-card text-destructive' : 'text-muted-foreground'}`} onClick={() => setMarked(true)} aria-label="З поміткою"><Cross /><span className="hidden min-[380px]:inline">З поміткою</span><span className="text-xs tabular-nums">{markedCount}</span></Button>
          </div>
        </div>
      </div>
    </div>
    <section className="mx-auto max-w-5xl px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-5">
      {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">Не вдалося оновити список.<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw />Повторити</Button></div>}
      {!data && !error && <div role="status" className="space-y-3"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />Завантаження дітей…</p>{[0, 1, 2, 3].map((n) => <div key={n} className="h-24 rounded-lg bg-muted motion-safe:animate-pulse" />)}</div>}
      {data && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold tracking-normal">{marked ? 'Діти з медичною поміткою' : 'Список дітей'}</h2><p className="text-xs text-muted-foreground tabular-nums">Знайдено: {visible.length}</p></div>}
      <div className="grid gap-2.5 lg:grid-cols-2">
        {visible.slice(0, limit).map((c, idx) => <Button key={c.id} data-doctor-tour={idx === 0 ? "card" : undefined} variant="outline" onClick={() => setOpenId(c.id)} className={`group h-auto min-h-0 w-full items-start justify-start gap-3 whitespace-normal rounded-lg bg-card p-3 text-left active:scale-[0.99] sm:min-h-[108px] sm:p-4 [touch-action:manipulation] hover:border-primary/50 hover:bg-muted/50 hover:text-foreground motion-safe:transition-colors ${medical[c.id]?.needs_attention ? 'border-destructive/30' : 'border-border'}`}>
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${medical[c.id]?.needs_attention ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{medical[c.id]?.needs_attention ? <Cross aria-label="Медична помітка" /> : String(c.team_number).padStart(2, '0')}</span>
          <div className="min-w-0 flex-1 space-y-1"><p className="break-words text-sm font-semibold leading-snug sm:text-base">{c.full_name}</p><p className="break-words text-xs text-muted-foreground">Команда {c.team_number} · {data?.shifts.find((s) => s.id === c.shift_id)?.name ?? 'Без зміни'}</p><p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Users className="mt-0.5 shrink-0" /><span className="break-words">{supervisorsForChild(data?.assignments ?? [], c.shift_id, c.team_number).join(' · ') || 'Супровід не призначений'}</span></p>{c.phone && <p className="flex items-center gap-1.5 text-xs text-primary"><Phone /><span className="break-all tabular-nums">{c.phone}</span></p>}</div>
          <ChevronRight className="mt-1 text-muted-foreground group-hover:text-primary" />
        </Button>)}
      </div>
      {data && visible.length === 0 && <div className="flex flex-col items-center gap-3 py-16 text-center"><Search className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Дітей не знайдено</p></div>}
      {visible.length > limit && <Button variant="secondary" className="mt-4 h-11 w-full" onClick={() => setLimit((n) => n + 60)}>Показати ще</Button>}
    </section>
    {child && <MedicalProfile key={child.id} child={child} medical={medical[child.id]} supervisors={supervisorsForChild(data?.assignments ?? [], child.shift_id, child.team_number)} onClose={() => { if (!tourOpen) setOpenId(null); }} onSave={save} onConflict={() => void load()} light={theme === 'light'} />}
  </main>;
}

function MedicalProfile({ child, medical, supervisors, onClose, onSave, onConflict, light }: { child: Child; medical?: MedicalNote; supervisors: string[]; onClose: () => void; onSave: (n: string, a: boolean, v: number) => Promise<void>; onConflict: () => void; light: boolean }) {
  const [note, setNote] = useState(medical?.note ?? '');
  const [attention, setAttention] = useState(medical?.needs_attention ?? false);
  const [version, setVersion] = useState(medical?.version ?? 0);
  const baseline = useRef({ note: medical?.note ?? '', attention: medical?.needs_attention ?? false });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = note !== baseline.current.note || attention !== baseline.current.attention;
  useEffect(() => {
    if (version === (medical?.version ?? 0)) return;
    if (note !== baseline.current.note || attention !== baseline.current.attention) { setConflict(true); return; }
    baseline.current = { note: medical?.note ?? '', attention: medical?.needs_attention ?? false };
    setNote(baseline.current.note); setAttention(baseline.current.attention); setVersion(medical?.version ?? 0);
  }, [medical?.version, medical?.note, medical?.needs_attention, note, attention, version]);
  const close = () => { if (!busy && (!dirty || window.confirm('Закрити без збереження помітки?'))) onClose(); };
  const rows = [['Телефон', child.phone], ['Telegram', child.telegram_username], ['Категорія', child.team_name], ['Стать', child.gender === 'girl' ? 'Дівчинка' : child.gender === 'boy' ? 'Хлопчик' : 'Не визначено'], ['Баланс А$', String(child.iron_dollars)], ['Зі списку', child.note_from_table], ['Нотатки супроводу', child.supervisor_notes]];
  return <Dialog open onOpenChange={(v) => !v && close()}><DialogContent className={`doctor-desk text-foreground h-[100dvh] w-[100dvw] max-w-none max-h-[100dvh] gap-0 flex flex-col overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:w-[calc(100dvw-2rem)] sm:max-w-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:border ${light ? 'staff-light' : ''}`}>
    <DialogHeader className="shrink-0 border-b border-border bg-card px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] pr-12 sm:p-5 sm:pr-12"><p className="mb-1 flex items-center gap-2 text-xs font-medium text-primary"><Stethoscope className="h-4 w-4" />Профіль дитини</p><DialogTitle className="break-words text-left text-lg leading-snug tracking-normal">{child.full_name}</DialogTitle><DialogDescription className="text-left text-xs text-muted-foreground">Команда {child.team_number} · {child.is_present ? 'Присутній(я)' : 'Відсутній(я)'}</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-6">
      <section className="space-y-3"><div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold tracking-normal"><Cross className="h-4 w-4 text-destructive" />Медична помітка</h2>{attention && <span className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">Потребує уваги</span>}</div>
        <div data-doctor-tour="attention" className={`flex items-center gap-3 rounded-md border p-3 ${attention ? 'border-destructive/25 bg-destructive/5' : 'border-border bg-muted/40'}`}><Checkbox id="medical-attention" className="h-5 w-5" checked={attention} onCheckedChange={(v) => setAttention(v === true)} /><Label htmlFor="medical-attention" className="flex-1 cursor-pointer py-1 text-sm leading-snug">Потребує уваги супроводу</Label></div>
        <div data-doctor-tour="note" className="space-y-2"><Label htmlFor="medical-note" className="text-xs text-muted-foreground">Нотатка лікаря</Label><Textarea id="medical-note" rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-28 resize-none bg-card text-base leading-relaxed sm:text-sm" /></div>
        {medical?.needs_attention && <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={() => setAttention(false)}>Прибрати червоний плюсик</Button>}
        {conflict && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">Помітку вже змінив інший лікар. Ваш текст залишився в полі.</p><Button variant="outline" onClick={() => { baseline.current = { note: medical?.note ?? '', attention: medical?.needs_attention ?? false }; setNote(baseline.current.note); setAttention(baseline.current.attention); setVersion(medical?.version ?? 0); setConflict(false); }}>Завантажити свіжу помітку</Button></div>}
      </section>
      <section data-doctor-tour="supervisors" className="border-t border-border pt-4"><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-normal"><Users className="h-4 w-4 text-primary" />Супровід команди</h2><p className="break-words text-sm leading-relaxed">{supervisors.join(' · ') || 'Не призначений'}</p></section>
      <section className="border-t border-border pt-4"><h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-normal"><ClipboardList className="h-4 w-4 text-primary" />Дані дитини</h2><dl className="grid grid-cols-1 gap-x-4 gap-y-3 min-[380px]:grid-cols-2 sm:gap-y-4">{rows.filter(([, v]) => v).map(([label, value]) => <div key={label} className={label === 'Зі списку' || label === 'Нотатки супроводу' ? 'col-span-2 min-w-0' : 'min-w-0'}><dt className="mb-1 text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{label === 'Телефон' ? <a className="inline-flex items-center gap-1.5 text-primary" href={`tel:${value}`}><Phone className="h-3.5 w-3.5 shrink-0" />{value}</a> : value}</dd></div>)}</dl></section>
      {child.raw_data && <section className="border-t border-border pt-4"><h2 className="mb-3 text-sm font-semibold tracking-normal">Додаткові дані</h2><dl className="space-y-3">{Object.entries(child.raw_data).map(([k, v]) => <div key={k} className="min-w-0"><dt className="break-words text-xs text-muted-foreground">{k}</dt><dd className="text-sm break-words [overflow-wrap:anywhere]">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</dd></div>)}</dl></section>}
    </div>
    <footer data-doctor-tour="save" className="flex gap-2 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0"><Button variant="outline" onClick={close} disabled={busy} className="flex-1 h-12 sm:h-11">Закрити</Button><Button className="flex-1 h-12 sm:h-11" disabled={busy || conflict} onClick={async () => { setBusy(true); try { await onSave(note, attention, version); } catch (e) { if (e instanceof Error && e.message === 'medical_note_conflict') { setConflict(true); onConflict(); } else toast.error('Не збережено. Перевірте зв’язок і повторіть.'); } finally { setBusy(false); } }}>{busy ? <Loader2 className="motion-safe:animate-spin" /> : <Check />}{busy ? 'Збереження…' : 'Зберегти'}</Button></footer>
  </DialogContent></Dialog>;
}
