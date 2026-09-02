import { useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Loader2,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { parseSheetUrl } from '@/lib/importer';
import type { ShiftType } from '@/types/app';
import {
  analyzeSource,
  commitMultiFileShift,
  makeFileSource,
  makeSheetSource,
  mergeSources,
  sourceTeams,
  type MultiFileSource,
} from '@/lib/multiFileImporter';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const TYPE_LABELS: Record<ShiftType, string> = {
  long: 'Довга зміна',
  short: 'Коротка зміна',
  international: 'Міжнародна',
  sports: 'Спортивна',
};

const MultiFileShiftModal = ({ open, onOpenChange, onCreated }: Props) => {
  const [sources, setSources] = useState<MultiFileSource[]>([]);
  const [sheetUrl, setSheetUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ShiftType>('long');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const merged = useMemo(() => mergeSources(sources), [sources]);
  const readyCount = sources.filter((s) => s.status === 'ready').length;

  const patch = (id: string, next: Partial<MultiFileSource>) =>
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));

  const runAnalyze = async (src: MultiFileSource) => {
    patch(src.id, { status: 'analyzing', error: null });
    try {
      const res = await analyzeSource(src);
      if (!res.rows.length) {
        patch(src.id, { status: 'error', error: 'Не знайдено записів про учасників' });
        return;
      }
      patch(src.id, { status: 'ready', result: res, error: null });
    } catch (err: any) {
      patch(src.id, { status: 'error', error: err?.message || 'Помилка читання' });
    }
  };

  const addFiles = (list: FileList | File[]) => {
    const created = Array.from(list).map(makeFileSource);
    if (!created.length) return;
    setSources((prev) => [...prev, ...created]);
    created.forEach((s) => void runAnalyze(s));
  };

  const addSheet = () => {
    if (!parseSheetUrl(sheetUrl)) {
      toast.error('Некоректне посилання на Google Таблицю');
      return;
    }
    const s = makeSheetSource(sheetUrl);
    setSources((prev) => [...prev, s]);
    setSheetUrl('');
    void runAnalyze(s);
  };

  const removeSource = (id: string) => setSources((prev) => prev.filter((s) => s.id !== id));

  const reset = () => {
    setSources([]); setSheetUrl(''); setName(''); setStart(''); setEnd('');
    setProgress(0); setProgressLabel('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (!name.trim() || !start || !end) { toast.error('Заповніть назву та дати зміни'); return; }
    if (!merged.rows.length) { toast.error('Додайте хоча б один файл з учасниками'); return; }
    setBusy(true);
    setProgress(0);
    try {
      const res = await commitMultiFileShift(
        {
          name: name.trim(),
          shift_type: type,
          shift_category: type,
          start_date: start,
          end_date: end,
          assigned_teams: merged.summary.teams,
          travel_start_date: start,
          hotel_start_date: start,
        },
        sources,
        (pct, label) => { setProgress(pct); setProgressLabel(label); }
      );
      toast.success(`Зміну створено · ${res.inserted} учасників із ${res.files} джерел`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      toast.error(err?.message || 'Не вдалося створити зміну');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0B0F19]/95 backdrop-blur-2xl border border-white/10 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold uppercase tracking-wider text-[#FA5A15]">
            Мульти-імпорт зміни
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Завантажте кілька таблиць одночасно (PDF, Excel, CSV, Google Таблиці) та зведіть їх в одну зміну.
          </DialogDescription>
        </DialogHeader>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-[#FA5A15] bg-[#FA5A15]/10' : 'border-white/15 bg-white/5'
          }`}
        >
          <Upload className="mx-auto h-6 w-6 text-[#FA5A15]" strokeWidth={1.75} />
          <p className="mt-2 text-xs font-semibold text-slate-200">Перетягніть файли або натисніть для вибору</p>
          <p className="text-[10px] text-slate-500">.xlsx · .xls · .csv · .pdf — можна кілька одразу</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        <div className="flex gap-2">
          <Input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="Посилання на Google Таблицю"
            className="h-10 rounded-xl bg-white/5 border-white/10 text-white text-xs"
          />
          <Button type="button" variant="outline" className="h-10 rounded-xl shrink-0" onClick={addSheet}>
            <Link2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Список джерел */}
        {sources.length > 0 && (
          <div className="space-y-2">
            {sources.map((s) => {
              const teams = s.status === 'ready' ? sourceTeams(s) : [];
              const count = s.result?.rows.filter((r) => r.full_name && r.team_number).length ?? 0;
              return (
                <div key={s.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                    <span className="flex-1 truncate text-xs font-semibold text-slate-100">{s.label}</span>
                    {s.status === 'analyzing' && <Loader2 className="h-4 w-4 animate-spin text-[#FA5A15]" />}
                    {s.status === 'ready' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {s.status === 'error' && <AlertTriangle className="h-4 w-4 text-red-400" />}
                    <button type="button" onClick={() => removeSource(s.id)} className="text-slate-500 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {s.status === 'error' && <p className="text-[11px] text-red-400">{s.error}</p>}

                  {s.status === 'ready' && (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px]">
                          <Users className="mr-1 h-3 w-3" />{count}
                        </Badge>
                        {teams.map((t) => (
                          <Badge key={t} className="bg-[#FA5A15]/20 text-[#FA5A15] text-[9px] border-0">
                            {t} команда
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-slate-400">Зсув команд</Label>
                        <Input
                          type="number"
                          value={s.teamOffset}
                          onChange={(e) => patch(s.id, { teamOffset: Number(e.target.value) || 0 })}
                          className="h-8 w-20 rounded-lg bg-white/5 border-white/10 text-white text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Дублікати */}
        {merged.summary.duplicates.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Дублікати між файлами ({merged.summary.duplicates.length})
            </p>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {merged.summary.duplicates.slice(0, 30).map((d, i) => (
                <p key={`${d.key}-${i}`} className="text-[11px] text-amber-200/90">
                  {d.exact ? '⚠︎' : '≈'} {d.fullName} · {d.teamNumber} команда · {d.sources.join(' + ')}
                  {d.exact ? ' — залишено 1 запис' : ' — однофамільці'}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Параметри зміни */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-slate-300">Назва зміни</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Зміна #1 · Карпати"
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-slate-300">Тип зміни</Label>
            <Select value={type} onValueChange={(v) => setType(v as ShiftType)}>
              <SelectTrigger className="h-11 rounded-xl bg-white/5 border-white/10 text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as ShiftType[]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Початок</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Завершення</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white" />
          </div>
        </div>

        {/* Підсумок */}
        {merged.rows.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Підсумок</p>
            <p className="text-xs text-slate-200">
              Джерел: {readyCount} · Рядків: {merged.summary.totalRows} · Унікальних: {merged.summary.uniqueRows}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {merged.summary.teams.map((t) => (
                <Badge key={t} variant="outline" className="text-[9px]">
                  {t} команда · {merged.summary.perTeam[t] ?? 0}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Прогрес */}
        {busy && (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#FA5A15] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[10px] text-slate-400">{progressLabel} · {progress}%</p>
          </div>
        )}

        <Button
          onClick={submit}
          disabled={busy || !merged.rows.length}
          className="h-12 w-full rounded-xl bg-[#FA5A15] font-bold hover:bg-[#FA5A15]/90"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Створити зміну ({merged.summary.uniqueRows})
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default MultiFileShiftModal;
