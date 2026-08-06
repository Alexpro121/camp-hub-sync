import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Upload, Trash2, Calendar, CalendarDays, Sparkles, Plus, Loader2, Database, FileSpreadsheet, CheckCircle2, BarChart3, AlertTriangle, Coins, Users, ArrowRightLeft, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import type { Shift, ShiftType } from '@/types/app';

import { analyzeFile, analyzeSheetUrl } from '@/lib/importAnalyze';
import { parseSheetUrl, toDbRow, type ImportResult } from '@/lib/importer';
import ImportPreviewDialog from '@/components/admin/ImportPreviewDialog';
import { shiftStatus } from '@/lib/shift';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { FullScreenLoader } from '@/components/ui/loader';
import ScheduleAdmin from '@/components/schedule/ScheduleAdmin';
import TalentAdmin from '@/components/talent/TalentAdmin';

interface Props { onBack: () => void; }

const SHIFT_LABELS: Record<ShiftType, string> = {
  long: 'Довга (12 днів)',
  short: 'Коротка (5 днів)',
  international: 'Міжнародна',
};

const AdminFlow = ({ onBack }: Props) => {
  return (
    <div className="min-h-screen max-w-3xl mx-auto pb-16 safe-bottom">
      <div className="app-bar px-4 py-3 safe-top border-b border-border/40">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-smooth min-h-[44px] pr-2">
            <ArrowLeft className="w-4 h-4" /> Вийти
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👑</span>
            <p className="text-lg font-black uppercase text-gradient-primary">Admin</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="shifts" className="w-full px-3">
        <div className="sticky top-[60px] z-20 -mx-3 px-3 py-2 bg-background/85 backdrop-blur-md">
          <TabsList className="grid grid-cols-5 h-[54px] w-full p-1">
            <TabsTrigger value="shifts" className="flex-col gap-0.5 h-full text-[11px] leading-none"><Calendar className="w-[18px] h-[18px]" /> <span>Зміни</span></TabsTrigger>
            <TabsTrigger value="schedule" className="flex-col gap-0.5 h-full text-[11px] leading-none"><CalendarDays className="w-[18px] h-[18px]" /> <span>Розклад</span></TabsTrigger>
            <TabsTrigger value="talent" className="flex-col gap-0.5 h-full text-[11px] leading-none"><Sparkles className="w-[18px] h-[18px]" /> <span>Таланти</span></TabsTrigger>
            <TabsTrigger value="stats" className="flex-col gap-0.5 h-full text-[11px] leading-none"><BarChart3 className="w-[18px] h-[18px]" /> <span>Статистика</span></TabsTrigger>
            <TabsTrigger value="data" className="flex-col gap-0.5 h-full text-[11px] leading-none"><Database className="w-[18px] h-[18px]" /> <span>База</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="shifts" className="mt-3"><ShiftsTab /></TabsContent>
        <TabsContent value="schedule" className="mt-3"><ScheduleAdmin /></TabsContent>
        <TabsContent value="talent" className="mt-3"><TalentAdmin /></TabsContent>
        <TabsContent value="stats" className="mt-3"><StatsTab /></TabsContent>
        <TabsContent value="data" className="mt-3"><DataTab /></TabsContent>
      </Tabs>
    </div>

  );
};

/* ---------- SHIFTS + UPLOAD COMBINED TAB ---------- */
const ShiftsTab = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<ShiftType>('long');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from('shifts').select('*').order('start_date', { ascending: false });
    setShifts((data || []) as Shift[]);
  };
  useEffect(() => { load(); }, []);

  const computeEnd = (startStr: string, t: ShiftType) => {
    if (!startStr || t === 'international') return '';
    // Auto-suggest +1 extra day vs nominal length (e.g. long shift = 12 days → start + 12)
    const days = t === 'long' ? 12 : 5;
    const d = new Date(startStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const onTypeChange = (t: ShiftType) => {
    setType(t);
    const e = computeEnd(start, t);
    if (e) setEnd(e);
  };

  const onStartChange = (v: string) => {
    setStart(v);
    const e = computeEnd(v, type);
    if (e) setEnd(e);
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const reset = () => {
    setName(''); setStart(''); setEnd(''); setFile(null); setSheetUrl('');
    setPreview(null); setSourceLabel('');
    if (fileRef.current) fileRef.current.value = '';
  };

  /** Step 1 — read the source (file or Google Sheet), analyze columns, show preview. */
  const analyze = async () => {
    if (!name || !start || !end) { toast.error('Заповни назву та дати'); return; }
    if (!file && !sheetUrl.trim()) { await createOnly(); return; }
    if (sheetUrl.trim() && !parseSheetUrl(sheetUrl)) { toast.error('Некоректне посилання на Google Таблицю'); return; }
    setAnalyzing(true);
    try {
      const res = file ? await analyzeFile(file) : await analyzeSheetUrl(sheetUrl);
      if (!res.rows.length) { toast.warning('У таблиці не знайдено рядків з дітьми'); return; }
      setSourceLabel(file ? file.name : sheetUrl.trim());
      setPreview(res);
      setPreviewOpen(true);
    } catch (err: any) {
      toast.error(err.message || 'Не вдалося зчитати таблицю');
    } finally {
      setAnalyzing(false);
    }
  };

  const createOnly = async () => {
    if (!name || !start || !end) { toast.error('Заповни назву та дати'); return; }
    setCreating(true);
    try {
      const { data: shift, error: shErr } = await supabase.from('shifts').insert({
        name, shift_type: type, start_date: start, end_date: end,
        team_offset: 0, is_active: true,
      }).select().single();
      if (shErr || !shift) throw shErr || new Error('Не вдалось створити зміну');
      toast.success('Зміну створено');
      reset();
      load();
    } catch (err: any) {
      toast.error(err.message || 'Помилка');
    } finally {
      setCreating(false);
    }
  };

  /** Step 2 — confirmed in preview: create the shift and write deduplicated rows. */
  const confirmImport = async () => {
    if (!preview) return;
    setCreating(true);
    try {
      const { data: shift, error: shErr } = await supabase.from('shifts').insert({
        name, shift_type: type, start_date: start, end_date: end,
        team_offset: 0, is_active: true,
      }).select().single();
      if (shErr || !shift) throw shErr || new Error('Не вдалось створити зміну');

      const valid = preview.rows.filter(r => r.full_name && r.team_number);
      const dbRows = valid.map(r => toDbRow(r, shift.id));

      // Dedup by shift_id + team_number + normalized name against what's already stored
      const { data: existing } = await supabase
        .from('children').select('id, full_name, team_number').eq('shift_id', shift.id);
      const map = new Map<string, string>();
      (existing || []).forEach((c: any) => map.set(`${c.team_number}|${(c.full_name || '').toLowerCase().trim()}`, c.id));

      const toInsert: any[] = [];
      for (const r of dbRows) {
        const id = map.get(`${r.team_number}|${r.full_name.toLowerCase().trim()}`);
        if (id) {
          await supabase.from('children').update({
            is_present: r.is_present, row_number: r.row_number, phone: r.phone,
            team_name: r.team_name, note_from_table: r.note_from_table, raw_data: r.raw_data,
          }).eq('id', id);
        } else {
          toInsert.push(r);
        }
      }
      if (toInsert.length) {
        const { error: insErr } = await supabase.from('children').insert(toInsert);
        if (insErr) throw insErr;
      }

      await supabase.from('uploaded_files').insert({
        filename: sourceLabel || 'Google Sheets',
        shift_id: shift.id,
        rows_count: valid.length,
      });

      toast.success(`✅ Зміну створено · імпортовано ${valid.length} дітей`);
      setPreviewOpen(false);
      reset();
      load();
    } catch (err: any) {
      toast.error(err.message || 'Помилка');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    // Cascade: get child IDs of this shift to remove their transfers, then children, file refs, finally the shift
    const { data: kids } = await supabase.from('children').select('id').eq('shift_id', id);
    const childIds = (kids || []).map((k: any) => k.id);
    if (childIds.length) {
      await supabase.from('transfers').delete().in('child_id', childIds);
    }
    await supabase.from('children').delete().eq('shift_id', id);
    await supabase.from('uploaded_files').delete().eq('shift_id', id);
    await supabase.from('shifts').delete().eq('id', id);
    load();
    toast.success('Зміну видалено разом із даними');
  };

  return (
    <div className="space-y-4">
      {creating && <FullScreenLoader label={preview ? 'Імпорт таблиці' : 'Створення зміни'} />}
      {analyzing && <FullScreenLoader label="ШІ аналізує структуру таблиці…" />}
      <ImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        result={preview}
        busy={creating}
        onConfirm={confirmImport}
      />
      <Card className="p-5 bg-gradient-card space-y-3">
        <h3 className="font-bold uppercase text-sm tracking-wide">Створити зміну і завантажити таблицю</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Назва зміни</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Літо-2026 #1" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Тип</Label>
            <Select value={type} onValueChange={(v) => onTypeChange(v as ShiftType)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="long">{SHIFT_LABELS.long}</SelectItem>
                <SelectItem value="short">{SHIFT_LABELS.short}</SelectItem>
                <SelectItem value="international">{SHIFT_LABELS.international}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Початок</Label>
              <Input type="date" value={start} onChange={e => onStartChange(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Кінець <span className="text-primary/70">(авто)</span></Label>
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-11" />
            </div>
          </div>

          {/* File upload area */}
          <div className="space-y-1.5">
            <Label className="text-xs">Варіант А · Файл (.xlsx / .xls / .csv)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFilePick}
              className="hidden"
              id="shift-file-up"
            />
            <label
              htmlFor="shift-file-up"
              className={`flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-smooth ${file ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40'}`}
            >
              {file ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">Натисни «Створити» щоб завантажити</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.preventDefault(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="shrink-0"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Обрати файл</p>
                    <p className="text-[11px] text-muted-foreground">Стовпці: Наявність, №, № Команди, ПІБ, Телефон, Команда, Примітка</p>
                  </div>
                </>
              )}
            </label>
            <p className="text-[10px] text-muted-foreground">
              Команди читаються прямо зі стовпця «№ Команди». Якщо дитина вже існує — її дані оновляться.
            </p>
          </div>

          {/* Google Sheets URL */}
          <div className="space-y-1.5">
            <Label className="text-xs">Варіант Б · Посилання на Google Таблицю</Label>
            <div className="relative">
              <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="h-11 pl-9 text-xs"
                disabled={!!file}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Таблиця має бути відкрита за посиланням («Усі, хто має посилання — Переглядач»). ШІ сам розпізнає колонки навіть з описками.
            </p>
          </div>

          <Button onClick={analyze} disabled={creating || analyzing} className="w-full h-12 font-bold uppercase">
            {creating || analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : (file || sheetUrl.trim())
              ? <><Sparkles className="w-4 h-4 mr-2" /> Аналізувати таблицю</>
              : <><Plus className="w-4 h-4 mr-2" /> Створити зміну</>}
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        <h3 className="font-bold uppercase text-sm tracking-wide px-1">Активні зміни</h3>
        {shifts.length === 0 ? (
          <Card className="p-6 text-center bg-card/50"><p className="text-sm text-muted-foreground">Немає змін</p></Card>
        ) : shifts.map(s => (
          <ShiftRow key={s.id} shift={s} onDelete={() => remove(s.id)} />
        ))}
      </div>
    </div>
  );
};

const ShiftRow = ({ shift: s, onDelete }: { shift: Shift; onDelete: () => void }) => {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const { count: c } = await supabase.from('children').select('id', { count: 'exact', head: true }).eq('shift_id', s.id);
      setCount(c ?? 0);
    })();
  }, [s.id]);

  const status = shiftStatus(s);
  const statusMeta: Record<typeof status, { label: string; cls: string }> = {
    active:   { label: 'Активна',   cls: 'bg-success/20 text-success border-success/40' },
    upcoming: { label: 'Майбутня',  cls: 'bg-primary/20 text-primary border-primary/40' },
    finished: { label: 'Завершена', cls: 'bg-muted text-muted-foreground border-border' },
  };

  return (
    <Card className="p-3 flex items-center gap-3 bg-gradient-card">
      <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <Calendar className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-bold truncate">{s.name}</p>
          <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${statusMeta[status].cls}`}>
            {statusMeta[status].label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {SHIFT_LABELS[s.shift_type]} · {s.start_date} → {s.end_date}
        </p>
        <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
          <FileSpreadsheet className="w-3 h-3" /> {count ?? '...'} дітей
        </p>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="shrink-0">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Видалити зміну «{s.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Буде безповоротно видалено:
              <span className="block mt-2 space-y-0.5">
                <span className="block">• {count ?? '…'} дітей цієї зміни</span>
                <span className="block">• історію переведень цих дітей</span>
                <span className="block">• посилання на завантажені файли зміни</span>
              </span>
              <span className="block mt-2 font-semibold text-destructive">
                Цю дію не можна скасувати.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">
              Видалити назавжди
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

/* ---------- DATA TAB ---------- */
const DataTab = () => {
  const [count, setCount] = useState(0);
  const [teamsCount, setTeamsCount] = useState(0);
  const [passwords, setPasswords] = useState<Array<{ team: number; password: string }> | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('children').select('team_number');
    setCount(data?.length || 0);
    setTeamsCount(new Set((data || []).map((d: any) => d.team_number)).size);
  };
  useEffect(() => { load(); }, []);

  const loadPasswords = async () => {
    setPwLoading(true);
    const { data, error } = await supabase.functions.invoke('staff-login', {
      body: { action: 'list_team_passwords' },
    });
    setPwLoading(false);
    if (error || !data?.passwords) { toast.error('Не вдалося отримати паролі'); return; }
    setPasswords(data.passwords);
  };

  const wipe = async () => {
    await supabase.from('children').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('transfers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    toast.success('База очищена');
    load();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-5 bg-gradient-card">
          <p className="text-xs uppercase text-muted-foreground tracking-wider">Дітей</p>
          <p className="text-4xl font-black mt-1 text-gradient-primary tabular-nums">{count}</p>
        </Card>
        <Card className="p-5 bg-gradient-card">
          <p className="text-xs uppercase text-muted-foreground tracking-wider">Команд</p>
          <p className="text-4xl font-black mt-1 text-gradient-primary tabular-nums">{teamsCount}</p>
        </Card>
      </div>

      <Card className="p-5 bg-gradient-card space-y-3">
        <div>
          <p className="text-xs uppercase text-muted-foreground tracking-wider">Паролі супроводу</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1 leading-snug">
            Унікальні паролі для кожної команди. Передавай їх особисто.
          </p>
        </div>
        <Button onClick={loadPasswords} disabled={pwLoading} variant="secondary" className="w-full h-11 font-bold uppercase">
          {pwLoading ? 'Завантаження…' : 'Показати паролі'}
        </Button>
        {passwords && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {passwords.map((p) => (
              <div key={p.team} className="flex items-center justify-between rounded-lg bg-surface-1 px-3 py-2">
                <span className="text-sm font-bold">#{p.team}</span>
                <span className="text-sm font-mono tracking-wider">{p.password}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full h-12 font-bold uppercase">
            <Trash2 className="w-4 h-4 mr-2" /> Очистити всю базу
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити всі дані?</AlertDialogTitle>
            <AlertDialogDescription>
              Це видалить дітей, переведення і сповіщення. Зміни і файли залишаться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={wipe} className="bg-destructive">Видалити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/* ---------- STATS TAB ---------- */
interface ShiftStats {
  shift: Shift;
  total: number;
  present: number;
  loggedIn: number;
  ironTotal: number;
  teams: number;
  transfers: number;
}

const StatsTab = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ShiftStats[]>([]);
  const [orphans, setOrphans] = useState<{ total: number; teams: number; iron: number } | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: shifts }, { data: kids }, { data: trans }] = await Promise.all([
      supabase.from('shifts').select('*').order('start_date', { ascending: false }),
      supabase.from('children').select('id, shift_id, team_number, is_present, has_logged_in, iron_dollars'),
      supabase.from('transfers').select('child_id'),
    ]);

    const transfersByChild = new Map<string, number>();
    (trans || []).forEach((t: any) => {
      transfersByChild.set(t.child_id, (transfersByChild.get(t.child_id) || 0) + 1);
    });

    const stats: ShiftStats[] = (shifts || []).map((s: any) => {
      const inShift = (kids || []).filter((c: any) => c.shift_id === s.id);
      let transfers = 0;
      inShift.forEach((c: any) => { transfers += transfersByChild.get(c.id) || 0; });
      return {
        shift: s as Shift,
        total: inShift.length,
        present: inShift.filter((c: any) => c.is_present).length,
        loggedIn: inShift.filter((c: any) => c.has_logged_in).length,
        ironTotal: inShift.reduce((sum: number, c: any) => sum + (c.iron_dollars || 0), 0),
        teams: new Set(inShift.map((c: any) => c.team_number)).size,
        transfers,
      };
    });

    const orphanKids = (kids || []).filter((c: any) => !c.shift_id);
    setOrphans(orphanKids.length ? {
      total: orphanKids.length,
      teams: new Set(orphanKids.map((c: any) => c.team_number)).size,
      iron: orphanKids.reduce((s: number, c: any) => s + (c.iron_dollars || 0), 0),
    } : null);

    setRows(stats);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('stats-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading) {
    return <Card className="p-8 text-center bg-gradient-card"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></Card>;
  }

  if (rows.length === 0 && !orphans) {
    return (
      <Card className="p-8 text-center bg-gradient-card">
        <BarChart3 className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Немає даних для аналізу</p>
      </Card>
    );
  }

  // Aggregate header
  const totalKids = rows.reduce((s, r) => s + r.total, 0) + (orphans?.total || 0);
  const totalIron = rows.reduce((s, r) => s + r.ironTotal, 0) + (orphans?.iron || 0);
  const totalTransfers = rows.reduce((s, r) => s + r.transfers, 0);

  return (
    <div className="space-y-3">
      {/* Aggregate cards */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox icon={<Users className="w-3.5 h-3.5" />} label="Дітей" value={totalKids} />
        <StatBox icon={<Coins className="w-3.5 h-3.5" />} label="Айрон $" value={totalIron} />
        <StatBox icon={<ArrowRightLeft className="w-3.5 h-3.5" />} label="Трансферів" value={totalTransfers} />
      </div>

      <h3 className="font-bold uppercase text-sm tracking-wide px-1 pt-2">По змінах</h3>
      {rows.map((r) => <ShiftStatsCard key={r.shift.id} stats={r} />)}

      {orphans && (
        <Card className="p-4 bg-card/40 border-dashed">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Без зміни
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {orphans.total} дітей у {orphans.teams} командах · {orphans.iron} Айрон $.
            Не прив'язані до жодної зміни.
          </p>
        </Card>
      )}
    </div>
  );
};

const StatBox = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <Card className="p-3 bg-gradient-card">
    <div className="flex items-center gap-1 text-muted-foreground">
      {icon}
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
    <p className="text-2xl font-black text-gradient-primary tabular-nums mt-1">{value}</p>
  </Card>
);

const ShiftStatsCard = ({ stats: r }: { stats: ShiftStats }) => {
  const status = shiftStatus(r.shift);
  const statusMeta: Record<typeof status, { label: string; cls: string }> = {
    active:   { label: 'Активна',   cls: 'bg-success/20 text-success border-success/40' },
    upcoming: { label: 'Майбутня',  cls: 'bg-primary/20 text-primary border-primary/40' },
    finished: { label: 'Завершена', cls: 'bg-muted text-muted-foreground border-border' },
  };
  const presentPct = r.total ? Math.round((r.present / r.total) * 100) : 0;
  const loggedPct = r.total ? Math.round((r.loggedIn / r.total) * 100) : 0;

  return (
    <Card className="p-4 bg-gradient-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold truncate">{r.shift.name}</p>
            <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${statusMeta[status].cls}`}>
              {statusMeta[status].label}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {SHIFT_LABELS[r.shift.shift_type]} · {r.shift.start_date} → {r.shift.end_date}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Дітей" value={r.total} />
        <MiniStat label="Команд" value={r.teams} />
        <MiniStat label="Присутніх" value={`${r.present}`} hint={`${presentPct}%`} />
        <MiniStat label="Увійшло" value={`${r.loggedIn}`} hint={`${loggedPct}%`} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Айрон $" value={r.ironTotal} accent />
        <MiniStat label="Трансферів" value={r.transfers} />
      </div>

      {r.total > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="space-y-0.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Присутність</span>
              <span className="tabular-nums">{presentPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-success transition-all" style={{ width: `${presentPct}%` }} />
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Зайшло у профіль</span>
              <span className="tabular-nums">{loggedPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-gradient-primary transition-all" style={{ width: `${loggedPct}%` }} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

const MiniStat = ({ label, value, hint, accent }: { label: string; value: number | string; hint?: string; accent?: boolean }) => (
  <div className="rounded-lg bg-surface-1 p-2 border border-border/40">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <div className="flex items-baseline gap-1 mt-0.5">
      <p className={`text-lg font-black tabular-nums leading-none ${accent ? 'text-gradient-primary' : ''}`}>
        {value}
      </p>
      {hint && <span className="text-[9px] text-muted-foreground tabular-nums">{hint}</span>}
    </div>
  </div>
);

export default AdminFlow;
