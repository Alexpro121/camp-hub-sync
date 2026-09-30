import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, Link2, Loader2, Save, Trash2, Upload, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { staffCall, staffErr, KIND_LABEL, type StaffKind } from '@/lib/staffApi';
import type { ImportResult, ImportRow } from '@/lib/importer';
import type { Shift, ShiftType } from '@/types/app';
import { backfillGenders } from '@/lib/gender';

const TeamTagInput = lazy(() => import('@/components/admin/TeamTagInput'));
const ImportPreviewDialog = lazy(() => import('@/components/admin/ImportPreviewDialog'));

const TYPES: Record<ShiftType, string> = {
  long: 'Довга (12 днів)', short: 'Коротка (5 днів)', international: 'Міжнародна', sports: 'Спортивна зміна',
};

interface Member { user_id: string; full_name: string; login: string; is_active: boolean; kind: StaffKind }
interface Asg { id: string; staff_user_id: string; shift_id: string; team_number: number }

const nameKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/[’ʼ`']/g, "'").replace(/\s+/g, ' ').trim();

interface Props { shift: Shift; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }

export default function ShiftEditDialog({ shift, open, onOpenChange, onSaved }: Props) {
  const [tab, setTab] = useState('main');
  const [teamCounts, setTeamCounts] = useState<Map<number, number>>(new Map());

  const loadCounts = async () => {
    const { data } = await supabase.from('children').select('team_number').eq('shift_id', shift.id).is('deleted_at', null).limit(5000);
    const m = new Map<number, number>();
    (data ?? []).forEach((c: any) => m.set(c.team_number, (m.get(c.team_number) ?? 0) + 1));
    setTeamCounts(m);
  };
  useEffect(() => { if (open) loadCounts(); }, [open, shift.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto rounded-3xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base">Редагування · {shift.name}</DialogTitle>
          <DialogDescription className="text-xs">
            {[...teamCounts.values()].reduce((a, b) => a + b, 0)} учасників · {teamCounts.size} команд
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="main" className="text-xs">Основне</TabsTrigger>
            <TabsTrigger value="staff" className="text-xs">Супровід</TabsTrigger>
            <TabsTrigger value="import" className="text-xs">Довантажити</TabsTrigger>
          </TabsList>
          <TabsContent value="main"><MainTab shift={shift} onSaved={onSaved} /></TabsContent>
          <TabsContent value="staff"><StaffTab shift={shift} teamCounts={teamCounts} /></TabsContent>
          <TabsContent value="import"><ImportTab shift={shift} teamCounts={teamCounts} onDone={() => { loadCounts(); onSaved(); }} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MainTab({ shift, onSaved }: { shift: Shift; onSaved: () => void }) {
  const [name, setName] = useState(shift.name);
  const [type, setType] = useState<ShiftType>((shift.shift_category ?? shift.shift_type) as ShiftType);
  const [start, setStart] = useState(shift.start_date);
  const [end, setEnd] = useState(shift.end_date);
  const [teams, setTeams] = useState<number[]>(shift.assigned_teams ?? []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !start || !end) return toast.error('Заповніть назву та дати');
    if (end < start) return toast.error('Кінець раніше за початок');
    setBusy(true);
    const next = new Date(start); next.setDate(next.getDate() + 1);
    const { error } = await supabase.from('shifts').update({
      name: name.trim(), shift_type: type, shift_category: type, start_date: start, end_date: end,
      travel_start_date: start, hotel_start_date: next.toISOString().slice(0, 10),
      assigned_teams: [...new Set(teams)].sort((a, b) => a - b),
    }).eq('id', shift.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Зміну збережено');
    onSaved();
  };

  return (
    <div className="space-y-3 pt-3">
      <div className="space-y-1.5"><Label className="text-xs">Назва</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" /></div>
      <div className="space-y-1.5">
        <Label className="text-xs">Тип</Label>
        <Select value={type} onValueChange={(v) => setType(v as ShiftType)}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(TYPES) as ShiftType[]).map((t) => <SelectItem key={t} value={t}>{TYPES[t]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Початок</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-11 rounded-xl" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Кінець</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11 rounded-xl" /></div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Команди зміни</Label>
        <Suspense fallback={<div className="h-11 animate-pulse rounded-md bg-muted" />}><TeamTagInput value={teams} onChange={setTeams} /></Suspense>
      </div>
      <Button onClick={save} disabled={busy} className="h-11 w-full rounded-xl font-bold">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Зберегти
      </Button>
    </div>
  );
}

function StaffTab({ shift, teamCounts }: { shift: Shift; teamCounts: Map<number, number> }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [asg, setAsg] = useState<Asg[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<{ user: string; team: string }>({ user: '', team: '' });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => {
    try {
      const d = await staffCall<{ members: Member[]; assignments: Asg[] }>({ action: 'list' });
      setMembers(d.members); setAsg(d.assignments.filter((a) => a.shift_id === shift.id));
    } catch (e) { toast.error(staffErr(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [shift.id]);

  const teams = useMemo(() => {
    const s = new Set<number>([...(shift.assigned_teams ?? []), ...teamCounts.keys(), ...asg.map((a) => a.team_number)]);
    return [...s].filter((n) => n > 0).sort((a, b) => a - b);
  }, [shift.assigned_teams, teamCounts, asg]);
  const byId = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const options = members.filter((m) => m.is_active && (!q || nameKey(m.full_name).includes(nameKey(q)) || m.login.includes(q.toLowerCase())));

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await staffCall(body); toast.success(ok); await load(); return true; }
    catch (e) { toast.error(staffErr(e)); return false; } finally { setBusy(false); }
  };

  const copyInvite = async () => {
    try {
      const { invite } = await staffCall<{ invite: { token: string } }>({ action: 'shift_invite_create', shift_id: shift.id });
      await navigator.clipboard.writeText(`${window.location.origin}/staff/join/${invite.token}`);
      toast.success('Посилання скопійовано');
    } catch (e) { toast.error(staffErr(e)); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3 pt-3">
      <Button variant="secondary" className="w-full" onClick={copyInvite}><Link2 className="size-4" /> Скопіювати посилання для супроводу</Button>
      <div className="space-y-2">
        {teams.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">У зміні ще немає команд</p>}
        {teams.map((t) => {
          const list = asg.filter((a) => a.team_number === t);
          return (
            <div key={t} className="rounded-2xl border border-border bg-card/60 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-bold">Команда №{t}</p>
                <span className="text-[11px] text-muted-foreground">{teamCounts.get(t) ?? 0} дітей</span>
              </div>
              {list.length === 0 ? <p className="text-xs text-amber-500">Без супроводу</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {list.map((a) => {
                    const m = byId.get(a.staff_user_id);
                    return (
                      <span key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                        <span className="truncate">{m?.full_name ?? '—'}</span>
                        {m && <span className="text-muted-foreground">· {KIND_LABEL[m.kind ?? 'supervisor']}</span>}
                        <button aria-label="Зняти" disabled={busy} onClick={() => run({ action: 'unassign', assignment_id: a.id }, 'Знято з команди')} className="ml-0.5 text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="space-y-2 rounded-2xl border border-dashed border-border p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold"><UserPlus className="size-3.5" /> Призначити супровід</p>
        <Input placeholder="Пошук за ПІБ або логіном" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 rounded-xl" />
        <Select value={pick.user} onValueChange={(v) => setPick({ ...pick, user: v })}>
          <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Оберіть людину" /></SelectTrigger>
          <SelectContent className="max-h-72">
            {options.slice(0, 100).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name} · {KIND_LABEL[m.kind ?? 'supervisor']}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Select value={pick.team} onValueChange={(v) => setPick({ ...pick, team: v })}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Команда" /></SelectTrigger>
            <SelectContent>{teams.map((t) => <SelectItem key={t} value={String(t)}>№{t}</SelectItem>)}</SelectContent>
          </Select>
          <Button disabled={busy || !pick.user || !pick.team} onClick={async () => {
            if (await run({ action: 'assign', user_id: pick.user, shift_id: shift.id, team_number: Number(pick.team) }, 'Призначено')) setPick({ user: '', team: '' });
          }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Додати</Button>
        </div>
      </div>
    </div>
  );
}

function ImportTab({ shift, teamCounts, onDone }: { shift: Shift; teamCounts: Map<number, number>; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [report, setReport] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const label = file?.name || url.trim() || 'Google Sheets';

  const analyze = async () => {
    if (!file && !url.trim()) return toast.error('Оберіть файл або вставте посилання');
    setBusy(true); setReport(null);
    try {
      const { analyzeFile, analyzeSheetUrl } = await import('@/lib/importAnalyze');
      const res = file ? await analyzeFile(file) : await analyzeSheetUrl(url.trim());
      if (!res.rows.length) toast.warning('У таблиці не знайдено учасників');
      else setPreview(res);
    } catch (e: any) { toast.error(e?.message || 'Не вдалося зчитати таблицю'); }
    finally { setBusy(false); }
  };

  const commit = async (override?: ImportRow[]) => {
    if (!preview) return;
    setBusy(true);
    try {
      const { toDbRow } = await import('@/lib/importer');
      const rows = (override?.length ? override : preview.rows)
        .filter((r) => r.full_name && r.team_number)
        .map((r) => toDbRow({ ...r, team_number: Number(r.team_number) + offset }, shift.id));
      const { data: existing } = await supabase.from('children').select('id, full_name, team_number, deleted_at').eq('shift_id', shift.id).limit(5000);
      const byName = new Map<string, any>();
      (existing ?? []).forEach((c: any) => byName.set(nameKey(c.full_name || ''), c));
      const toInsert: any[] = []; const seen = new Set<string>();
      let updated = 0, skipped = 0;
      for (const r of rows) {
        const k = nameKey(r.full_name);
        if (seen.has(k)) { skipped++; continue; }
        seen.add(k);
        const ex = byName.get(k);
        if (ex?.deleted_at) { skipped++; continue; }
        if (ex) {
          // Команду не змінюємо: її могли перевести вручну. Оновлюємо лише порожні/довідкові поля.
          const patch: Record<string, unknown> = {};
          if (r.phone) patch.phone = r.phone;
          if (r.note_from_table) patch.note_from_table = r.note_from_table;
          if (r.team_name) patch.team_name = r.team_name;
          if (Object.keys(patch).length) { await supabase.from('children').update(patch).eq('id', ex.id); updated++; } else skipped++;
        } else toInsert.push(r);
      }
      for (let i = 0; i < toInsert.length; i += 50) {
        const { error } = await supabase.from('children').insert(toInsert.slice(i, i + 50));
        if (error) throw error;
      }
      const newTeams = [...new Set([...(shift.assigned_teams ?? []), ...toInsert.map((r) => r.team_number)])].sort((a, b) => a - b);
      if (newTeams.length !== (shift.assigned_teams ?? []).length) await supabase.from('shifts').update({ assigned_teams: newTeams }).eq('id', shift.id);
      await supabase.from('uploaded_files').insert({ filename: label, shift_id: shift.id, rows_count: toInsert.length });
      if (toInsert.length) void backfillGenders();
      setReport({ added: toInsert.length, updated, skipped });
      toast.success(`Додано ${toInsert.length}, оновлено ${updated}`);
      setPreview(null); setFile(null); setUrl(''); if (ref.current) ref.current.value = '';
      onDone();
    } catch (e: any) { toast.error(e?.message || 'Помилка імпорту'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 pt-3">
      <p className="text-xs text-muted-foreground">Нові учасники додаються до зміни. Ті, хто вже є (за ПІБ), не дублюються — у них лише доповнюється телефон і примітки, команда не змінюється.</p>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" id="shift-extra-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <label htmlFor="shift-extra-file" className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-border p-3.5 hover:border-primary/50">
        {file ? <CheckCircle2 className="size-5 text-primary" /> : <Upload className="size-5 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{file ? file.name : 'Обрати файл (.xlsx / .csv)'}</span>
        {file && <button onClick={(e) => { e.preventDefault(); setFile(null); if (ref.current) ref.current.value = ''; }}><Trash2 className="size-4 text-muted-foreground" /></button>}
      </label>
      <Input placeholder="або посилання на Google Таблицю" value={url} disabled={!!file} onChange={(e) => setUrl(e.target.value)} className="h-11 rounded-xl text-xs" />
      <div className="space-y-1.5">
        <Label className="text-xs">Зсув номерів команд (якщо у файлі команди 1–3, а в зміні це 4–6 — вкажіть 3)</Label>
        <Input type="number" min={0} max={50} value={offset} onChange={(e) => setOffset(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} className="h-11 rounded-xl" />
      </div>
      {teamCounts.size > 0 && <p className="text-[11px] text-muted-foreground">Зараз у зміні: {[...teamCounts.entries()].sort((a, b) => a[0] - b[0]).map(([t, n]) => `№${t} (${n})`).join(', ')}</p>}
      <Button onClick={analyze} disabled={busy} className="h-11 w-full rounded-xl font-bold">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Переглянути й довантажити
      </Button>
      {report && <div className="rounded-xl bg-muted p-3 text-xs">Додано: <b>{report.added}</b> · Оновлено: <b>{report.updated}</b> · Пропущено (дублікати/видалені): <b>{report.skipped}</b></div>}
      {preview && <Suspense fallback={null}><ImportPreviewDialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)} result={preview} busy={busy} onConfirm={commit} /></Suspense>}
    </div>
  );
}
