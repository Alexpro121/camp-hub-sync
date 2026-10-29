import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Cross, LogOut, RefreshCw, Search, Stethoscope, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const deferredQuery = useDeferredValue(query);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const d = await staffCall<DeskData>({ action: 'doctor_data' }, { signal }); if (!signal?.aborted) { setData(d); setError(false); } }
    catch { if (!signal?.aborted) setError(true); }
  }, []);
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
    setData((d) => d ? { ...d, medical: [...d.medical.filter((n) => n.child_id !== child.id), result.medical] } : d);
    toast.success('Медичну помітку збережено'); setOpenId(null);
  };
  return <main className={`min-h-[100dvh] bg-background text-foreground ${theme === 'light' ? 'staff-light' : ''}`}>
    <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3 safe-top">
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-center gap-2"><Stethoscope className="h-6 w-6 text-primary shrink-0" /><div className="min-w-0 flex-1"><h1 className="font-bold text-lg">Лікар</h1><p className="text-xs text-muted-foreground truncate">{name}</p></div>
          <Button size="icon" variant="ghost" onClick={toggleTheme} aria-label="Змінити тему">{theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" onClick={onLogout} aria-label="Вийти"><LogOut className="h-4 w-4" /></Button></div>
        <div className="relative"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input aria-label="Пошук дитини" placeholder="ПІБ або телефон" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 pl-10" /></div>
        <div className="flex flex-wrap gap-2"><Select value={shift} onValueChange={setShift}><SelectTrigger className="w-full sm:w-64 h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Усі зміни</SelectItem>{data?.shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          <Button variant={marked ? 'destructive' : 'outline'} className="h-11" onClick={() => setMarked((v) => !v)}><Cross className="mr-2 h-4 w-4" />З поміткою</Button></div>
      </div>
    </header>
    <section className="mx-auto max-w-3xl p-4 space-y-2">
      {error && <div role="alert" className="flex items-center gap-2 text-sm text-destructive">Не вдалося оновити список.<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1" />Повторити</Button></div>}
      {!data && !error && <p className="text-muted-foreground">Завантаження дітей…</p>}
      {data && <p className="text-xs text-muted-foreground pb-2">Знайдено: {visible.length}</p>}
      {visible.slice(0, limit).map((c) => <Button key={c.id} variant="outline" onClick={() => setOpenId(c.id)} className="h-auto min-h-[76px] w-full justify-start whitespace-normal p-3 text-left motion-safe:animate-in motion-safe:fade-in">
        {medical[c.id]?.needs_attention && <Cross className="h-5 w-5 shrink-0 text-destructive mr-3" aria-label="Медична помітка" />}
        <div className="min-w-0 flex-1"><p className="font-semibold break-words">{c.full_name}</p><p className="text-xs text-muted-foreground">Команда {c.team_number} · {data?.shifts.find((s) => s.id === c.shift_id)?.name ?? 'Без зміни'}</p><p className="text-xs text-muted-foreground break-words">{supervisorsForChild(data?.assignments ?? [], c.shift_id, c.team_number).join(' · ') || 'Супровід не призначений'}</p></div>
      </Button>)}
      {data && visible.length === 0 && <p className="py-8 text-center text-muted-foreground">Дітей не знайдено</p>}
      {visible.length > limit && <Button variant="secondary" className="w-full h-11" onClick={() => setLimit((n) => n + 60)}>Показати ще</Button>}
    </section>
    {child && <MedicalProfile key={child.id} child={child} medical={medical[child.id]} supervisors={supervisorsForChild(data?.assignments ?? [], child.shift_id, child.team_number)} onClose={() => setOpenId(null)} onSave={save} onConflict={() => void load()} light={theme === 'light'} />}
  </main>;
}

function MedicalProfile({ child, medical, supervisors, onClose, onSave, onConflict, light }: { child: Child; medical?: MedicalNote; supervisors: string[]; onClose: () => void; onSave: (n: string, a: boolean, v: number) => Promise<void>; onConflict: () => void; light: boolean }) {
  const [note, setNote] = useState(medical?.note ?? '');
  const [attention, setAttention] = useState(medical?.needs_attention ?? false);
  const [version] = useState(medical?.version ?? 0);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = note !== (medical?.note ?? '') || attention !== (medical?.needs_attention ?? false);
  const close = () => { if (!busy && (!dirty || window.confirm('Закрити без збереження помітки?'))) onClose(); };
  const rows = [['Телефон', child.phone], ['Telegram', child.telegram_username], ['Категорія', child.team_name], ['Стать', child.gender === 'girl' ? 'Дівчинка' : child.gender === 'boy' ? 'Хлопчик' : 'Не визначено'], ['Баланс А$', String(child.iron_dollars)], ['Зі списку', child.note_from_table], ['Нотатки супроводу', child.supervisor_notes]];
  return <Dialog open onOpenChange={(v) => !v && close()}><DialogContent className={`max-w-lg w-[calc(100dvw-1rem)] max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden p-0 ${light ? 'staff-light' : ''}`}>
    <DialogHeader className="border-b border-border p-4 pr-12 shrink-0"><DialogTitle className="break-words text-left">{child.full_name}</DialogTitle><p className="text-xs text-muted-foreground text-left">Команда {child.team_number} · {child.is_present ? 'Присутній(я)' : 'Відсутній(я)'}</p></DialogHeader>
    <div className="min-h-0 overflow-y-auto overscroll-contain p-4 space-y-5">
      <section><h2 className="text-sm font-semibold mb-2">Супровід</h2><p className="text-sm break-words">{supervisors.join(' · ') || 'Не призначений'}</p></section>
      <dl className="space-y-3">{rows.filter(([, v]) => v).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm whitespace-pre-wrap break-words">{label === 'Телефон' ? <a className="text-primary" href={`tel:${value}`}>{value}</a> : value}</dd></div>)}</dl>
      {child.raw_data && <dl className="space-y-2">{Object.entries(child.raw_data).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground break-words">{k}</dt><dd className="text-sm break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</dd></div>)}</dl>}
      <section className="border-t border-border pt-4 space-y-3"><h2 className="font-semibold flex items-center gap-2"><Cross className="h-4 w-4 text-destructive" />Медична помітка</h2>
        <div className="flex items-center gap-3"><Checkbox id="medical-attention" checked={attention} onCheckedChange={(v) => setAttention(v === true)} /><Label htmlFor="medical-attention">Потребує уваги супроводу</Label></div>
        <Label htmlFor="medical-note">Нотатка лікаря</Label><Textarea id="medical-note" rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none" />
        {medical?.needs_attention && <Button variant="outline" onClick={() => setAttention(false)}>Прибрати червоний плюсик</Button>}
        {conflict && <p role="alert" className="text-sm text-destructive">Помітку вже змінив інший лікар. Закрийте профіль і відкрийте знову.</p>}
      </section>
    </div>
    <footer className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0"><Button variant="outline" onClick={close} disabled={busy} className="flex-1 h-11">Закрити</Button><Button className="flex-1 h-11" disabled={busy || conflict} onClick={async () => { setBusy(true); try { await onSave(note, attention, version); } catch (e) { if (e instanceof Error && e.message === 'medical_note_conflict') { setConflict(true); onConflict(); } else toast.error('Не збережено. Перевірте зв’язок і повторіть.'); } finally { setBusy(false); } }}>{busy ? 'Збереження…' : 'Зберегти'}</Button></footer>
  </DialogContent></Dialog>;
}