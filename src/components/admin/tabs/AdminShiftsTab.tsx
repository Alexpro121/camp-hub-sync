import { copyText } from '@/lib/clipboard';
import { lazyRetry } from '@/lib/lazyRetry';
import { Suspense, useEffect, useRef, useState } from 'react';
import { 
  
  Upload, 
  Trash2, 
  Calendar, 
  
  
  Wand2, 
  Plus, 
  Loader2, 
  
  FileSpreadsheet, 
  CheckCircle2, 
  
  AlertTriangle, 
  
  
  
  Link2, 
  
  
  Copy, 
  
  ChevronDown, 
  
  
  
  
  
  
  Menu
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import type { Shift, ShiftType } from '@/types/app';

import type { ImportResult, ImportRow } from '@/lib/importer';
import { shiftStatus } from '@/lib/shift';
import { resolveShiftPhase, teamsOf } from '@/lib/shift-resolver';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FullScreenLoader } from '@/components/ui/loader';
import { backfillGenders } from '@/lib/gender';
import { normalizeName } from '@/lib/normalize';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { staffCall, staffErr } from '@/lib/staffApi';

const ImportPreviewDialog = lazyRetry(() => import('@/components/admin/ImportPreviewDialog'));
const MultiFileShiftModal = lazyRetry(() => import('@/components/admin/MultiFileShiftModal'));
const TeamTagInput = lazyRetry(() => import('@/components/admin/TeamTagInput'));
const ShiftEditDialog = lazyRetry(() => import('@/components/admin/ShiftEditDialog'));
import { SHIFT_LABELS } from '@/components/admin/tabs/shared';

/* =========================================================================
   ВКЛАДКА 1: КЕРУВАННЯ ЗМІНАМИ ТА ІМПОРТ
========================================================================= */
const ShiftsTab = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ShiftType>('long');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [teams, setTeams] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [multiOpen, setMultiOpen] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const island = useDynamicIsland();

  const load = async () => {
    const { data } = await supabase.from('shifts').select('*').order('start_date', { ascending: false });
    setShifts((data || []) as Shift[]);
    if (data && !data.some(s => !s.deleted_at)) setFormOpen(true);
  };
  useEffect(() => { load(); }, []);

  const addDays = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const computeEnd = (startStr: string, t: ShiftType) => {
    if (!startStr || t === 'international') return '';
    const days = t === 'long' ? 12 : 5;
    const d = new Date(startStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const baseLong = shifts.find((s) => (s.shift_category ?? s.shift_type) === 'long' && !s.deleted_at) ?? null;

  const onTypeChange = (t: ShiftType) => {
    setType(t);
    if ((t === 'short' || t === 'sports') && baseLong) {
      setStart(baseLong.start_date);
      setEnd(baseLong.end_date);
      return;
    }
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
    setTeams([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const shiftPayload = () => ({
    name,
    shift_type: type,
    shift_category: type,
    assigned_teams: teams,
    travel_start_date: start || null,
    hotel_start_date: start ? addDays(start, 1) : null,
    start_date: start,
    end_date: end,
    team_offset: 0,
    is_active: true,
  });

  const analyze = async () => {
    if (!name || !start || !end) { toast.error('Заповніть назву та дати зміни'); return; }
    if (!file && !sheetUrl.trim()) { await createOnly(); return; }
    
    setAnalyzing(true);
    island.showExcelProgress(15, file ? file.name : 'Google Sheets');
    try {
      if (sheetUrl.trim()) {
        const { parseSheetUrl } = await import('@/lib/importer');
        if (!parseSheetUrl(sheetUrl)) { toast.error('Некоректне посилання на Google Таблицю'); return; }
      }
      const { analyzeFile, analyzeSheetUrl } = await import('@/lib/importAnalyze');
      const res = file ? await analyzeFile(file) : await analyzeSheetUrl(sheetUrl);
      island.showExcelProgress(70, file ? file.name : 'Google Sheets');
      if (!res.rows.length) { 
        island.hide(); 
        toast.warning('У таблиці не знайдено записів про учасників'); 
        return; 
      }
      setSourceLabel(file ? file.name : sheetUrl.trim());
      setPreview(res);
      if (res.detectedTeams.length) setTeams(res.detectedTeams);
      setPreviewOpen(true);
      island.showExcelProgress(100, file ? file.name : 'Google Sheets');
      setTimeout(() => island.hide(), 700);
    } catch (err: any) {
      island.showError('Помилка імпорту', err.message || 'Не вдалося зчитати таблицю', String(err?.stack || err?.message || err));
      toast.error(err.message || 'Не вдалося зчитати таблицю');
    } finally {
      setAnalyzing(false);
    }
  };

  const syncShortShifts = async (startDate: string, endDate: string) => {
    await supabase
      .from('shifts')
      .update({ start_date: startDate, end_date: endDate, travel_start_date: startDate, hotel_start_date: addDays(startDate, 1) })
      .in('shift_category', ['short', 'sports'])
      .is('deleted_at', null);
  };

  const createOnly = async () => {
    if (!name || !start || !end) { toast.error('Заповніть назву та дати'); return; }
    setCreating(true);
    try {
      const detected = preview?.detectedTeams ?? [];
      const finalTeams = [...new Set([...teams, ...detected])].sort((a, b) => a - b);
      const { data: shift, error: shErr } = await supabase
        .from('shifts')
        .insert({ ...shiftPayload(), assigned_teams: finalTeams })
        .select()
        .single();
      if (shErr || !shift) throw shErr || new Error('Не вдалось створити зміну');
      if (type === 'long') await syncShortShifts(start, end);
      toast.success('Зміну успішно створено');
      reset();
      load();
    } catch (err: any) {
      toast.error(err.message || 'Помилка');
    } finally {
      setCreating(false);
    }
  };

  const confirmImport = async (overrideRows?: ImportRow[]) => {
    if (!preview) return;
    setCreating(true);
    island.showExcelProgress(20, sourceLabel || 'Google Sheets');
    try {
      const { data: shift, error: shErr } = await supabase.from('shifts').insert(shiftPayload()).select().single();
      if (shErr || !shift) throw shErr || new Error('Не вдалось створити зміну');
      if (type === 'long') await syncShortShifts(start, end);

      // Пріоритет — рядки з вікна перегляду (ручне налаштування колонок)
      const sourceRows = overrideRows?.length ? overrideRows : preview.rows;
      const valid = sourceRows.filter(r => r.full_name && r.team_number);
      const { toDbRow } = await import('@/lib/importer');
      const dbRows = valid.map(r => toDbRow(r, shift.id));
      island.showExcelProgress(45, sourceLabel || 'Google Sheets');

      const { data: existing } = await supabase
        .from('children').select('id, full_name, team_number').eq('shift_id', shift.id);
      const map = new Map<string, string>();
      (existing || []).forEach((c: any) => map.set(`${c.team_number}|${normalizeName(c.full_name || '')}`, c.id));

      const toInsert: any[] = [];
      let processed = 0;
      for (const r of dbRows) {
        const id = map.get(`${r.team_number}|${normalizeName(r.full_name)}`);
        if (id) {
          await supabase.from('children').update({
            is_present: r.is_present, row_number: r.row_number, phone: r.phone,
            team_name: r.team_name, note_from_table: r.note_from_table, raw_data: r.raw_data,
          }).eq('id', id);
        } else {
          toInsert.push(r);
        }
        processed++;
        island.showExcelProgress(45 + Math.round((processed / Math.max(1, dbRows.length)) * 45), sourceLabel || 'Google Sheets');
      }
      if (toInsert.length) {
        const { error: insErr } = await supabase.from('children').insert(toInsert);
        if (insErr) throw insErr;
        void backfillGenders();
      }

      await supabase.from('uploaded_files').insert({
        filename: sourceLabel || 'Google Sheets',
        shift_id: shift.id,
        rows_count: valid.length,
      });

      island.showExcelProgress(100, sourceLabel || 'Google Sheets');
      island.showSuccess('Зміну успішно імпортовано!', `${valid.length} учасників додано`);
      toast.success(`Зміну створено · імпортовано ${valid.length} учасників`);
      setPreviewOpen(false);
      reset();
      load();
    } catch (err: any) {
      island.showError('Помилка імпорту', err.message || 'Спробуйте ще раз', String(err?.stack || err?.message || err));
      toast.error(err.message || 'Помилка');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
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
      {creating && <FullScreenLoader label={preview ? 'Імпорт таблиці...' : 'Створення зміни...'} />}
      {analyzing && <FullScreenLoader label="Аналіз структури таблиці..." />}
      {previewOpen && <Suspense fallback={null}><ImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        result={preview}
        busy={creating}
        onConfirm={confirmImport}
      /></Suspense>}
      {multiOpen && <Suspense fallback={null}><MultiFileShiftModal open={multiOpen} onOpenChange={setMultiOpen} onCreated={load} /></Suspense>}
      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-xl font-bold">Зміни</h2>
        <Button size="sm" onClick={() => setFormOpen(v => !v)} aria-expanded={formOpen} className="shrink-0">
          {formOpen ? <ChevronDown className="rotate-180" /> : <Plus />} {formOpen ? 'Згорнути' : 'Створити'}
        </Button>
      </div>
      <div className="space-y-2">
        {shifts.filter(s => !s.deleted_at).length === 0 ? (
          <p className="py-5 text-sm text-muted-foreground">Немає зареєстрованих змін</p>
        ) : shifts.filter(s => !s.deleted_at && (showPast || shiftStatus(s) !== 'finished')).map(s => (
          <ShiftRow key={s.id} shift={s} onDelete={() => remove(s.id)} onChanged={load} />
        ))}
        {shifts.some(s => !s.deleted_at && shiftStatus(s) === 'finished') && (
          <Button variant="ghost" className="w-full justify-center text-muted-foreground" onClick={() => setShowPast(v => !v)}>
            <ChevronDown className={showPast ? 'rotate-180' : ''} /> {showPast ? 'Сховати минулі' : `Минулі зміни (${shifts.filter(s => !s.deleted_at && shiftStatus(s) === 'finished').length})`}
          </Button>
        )}
      </div>
      {formOpen && (
      <Card className="p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-3xl space-y-3 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold uppercase text-xs tracking-wider text-[#FA5A15]">
            Створити зміну та імпортувати учасників
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMultiOpen(true)}
            className="h-8 shrink-0 rounded-xl border-white/15 text-[10px] font-bold uppercase tracking-wider"
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> Мульти-імпорт
          </Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Назва зміни</Label>
            <Input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Зміна #1 · Карпати" 
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white" 
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Тип зміни</Label>
            <Select value={type} onValueChange={(v) => onTypeChange(v as ShiftType)}>
              <SelectTrigger className="h-11 rounded-xl bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#0F1523] border-white/10 text-white">
                <SelectItem value="long">{SHIFT_LABELS.long}</SelectItem>
                <SelectItem value="short">{SHIFT_LABELS.short}</SelectItem>
                <SelectItem value="sports">{SHIFT_LABELS.sports}</SelectItem>
                <SelectItem value="international">{SHIFT_LABELS.international}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Початок</Label>
              <Input 
                type="date" 
                value={start} 
                disabled={(type === 'short' || type === 'sports') && !!baseLong} 
                onChange={e => onStartChange(e.target.value)} 
                className="h-11 rounded-xl bg-white/5 border-white/10 text-white" 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Кінець <span className="text-[#FA5A15]">(авто)</span></Label>
              <Input 
                type="date" 
                value={end} 
                disabled={(type === 'short' || type === 'sports') && !!baseLong} 
                onChange={e => setEnd(e.target.value)} 
                className="h-11 rounded-xl bg-white/5 border-white/10 text-white" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Команди зміни</Label>
            <Suspense fallback={<div className="h-11 rounded-md bg-muted animate-pulse" />}><TeamTagInput value={teams} onChange={setTeams} /></Suspense>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!preview?.detectedTeams.length}
              onClick={() => {
                const detected = preview?.detectedTeams ?? [];
                setTeams(detected);
                toast.success(`Визначено команди: ${detected.map((t) => `№${t}`).join(', ')}`);
              }}
              className="h-9 text-xs rounded-xl bg-white/10 hover:bg-white/15 text-white"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" /> Автовизначити команди з файлу
            </Button>
          </div>

          {/* Завантаження файлу */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs text-slate-300">Варіант А · Файл Excel (.xlsx / .xls / .csv)</Label>
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
              className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                file ? 'border-[#FA5A15]/60 bg-[#FA5A15]/10' : 'border-white/10 hover:border-[#FA5A15]/40 bg-white/[0.02]'
              }`}
            >
              {file ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-[#FA5A15] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-white">{file.name}</p>
                    <p className="text-[11px] text-slate-400">Файл готовий до аналізу</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.preventDefault(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="shrink-0 text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-[#FA5A15]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-200">Обрати файл списку</p>
                    <p className="text-[11px] text-slate-400">Стовпці: № Команди, ПІБ, Телефон, Наявність тощо</p>
                  </div>
                </>
              )}
            </label>
          </div>

          {/* Google Sheets */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Варіант Б · Посилання на Google Таблицю</Label>
            <div className="relative">
              <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="h-11 pl-9 text-xs rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                disabled={!!file}
              />
            </div>
          </div>

          <Button 
            onClick={analyze} 
            disabled={creating || analyzing} 
            className="w-full h-12 font-bold uppercase rounded-xl bg-[#FA5A15] hover:bg-[#FF7D3B] text-white shadow-lg active:scale-[0.98] transition-transform mt-2"
          >
            {creating || analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : (file || sheetUrl.trim())
              ? <><Wand2 className="w-4 h-4 mr-2" /> Аналізувати структуру таблиці</>
              : <><Plus className="w-4 h-4 mr-2" /> Створити зміну</>}
          </Button>
        </div>
      </Card>
      )}
    </div>
  );
};

const ShiftRow = ({ shift: s, onDelete, onChanged }: { shift: Shift; onDelete: () => void; onChanged: () => void }) => {
  const [count, setCount] = useState<number | null>(null);
  const [copyingInvite, setCopyingInvite] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    (async () => {
      const { count: c } = await supabase.from('children').select('id', { count: 'exact', head: true }).eq('shift_id', s.id);
      setCount(c ?? 0);
    })();
  }, [s.id]);

  const status = shiftStatus(s);
  const copyStaffInvite = async () => {
    setCopyingInvite(true);
    try {
      const { invite } = await staffCall<{ invite: { token: string } }>({ action: 'shift_invite_create', shift_id: s.id });
      await copyText(`${window.location.origin}/staff/join/${invite.token}`);
      toast.success('Посилання для супроводу скопійовано');
    } catch (error) {
      toast.error(staffErr(error));
    } finally {
      setCopyingInvite(false);
    }
  };
  const statusMeta: Record<typeof status, { label: string; cls: string }> = {
    active:   { label: 'Активна',   cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    upcoming: { label: 'Майбутня',  cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    finished: { label: 'Завершена', cls: 'bg-white/5 text-slate-400 border-white/10' },
  };

  return (
    <Card className="p-3.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-[#0F1523]/80 border border-white/10 rounded-2xl shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shrink-0">
        <Calendar className="w-4 h-4 text-[#FA5A15]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-bold truncate text-white">{s.name}</p>
          <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${statusMeta[status].cls}`}>
            {statusMeta[status].label}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {SHIFT_LABELS[(s.shift_category ?? s.shift_type) as ShiftType] ?? SHIFT_LABELS[s.shift_type]} · {s.start_date} → {s.end_date}
        </p>
        <p className="text-[11px] text-slate-500">
          Команди: {teamsOf(s).join(', ') || '—'} · {resolveShiftPhase(s).phaseTitle}
        </p>
        <p className="text-[11px] text-[#FA5A15] font-semibold mt-0.5 flex items-center gap-1">
          <FileSpreadsheet className="w-3 h-3" /> {count ?? '...'} учасників
        </p>
      </div>

      <div className="col-span-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-t border-white/10 pt-3">
        <Button variant="secondary" className="min-w-0 justify-center" onClick={() => setEditOpen(true)}>
          <Wand2 className="size-4" /> Редагувати
        </Button>
        <Button variant="secondary" className="min-w-0 justify-center" disabled={copyingInvite} onClick={copyStaffInvite}>
          {copyingInvite ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} <span className="truncate">Супровід</span>
        </Button>
        {editOpen && <Suspense fallback={null}><ShiftEditDialog shift={s} open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} /></Suspense>}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="shrink-0 text-slate-400 hover:text-rose-400">
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-[#0F1523] border-white/10 text-white rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Видалити зміну «{s.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400 space-y-1">
              Будуть безповоротно видалені всі {count ?? '…'} учасників цієї зміни, їхні транзакції та історія переведень.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-slate-300 rounded-xl text-xs">Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold">
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Card>
  );
};


export default ShiftsTab;
