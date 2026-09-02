import React, { useMemo, useRef, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Trash2,
  Upload,
  Users,
  Clipboard,
  RefreshCw,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { parseSheetUrl } from '@/lib/importer';
import type { ShiftType } from '@/types/app';
import {
  analyzeSource,
  commitMultiFileShift,
  makeFileSource,
  makeSheetSource,
  makeTextSource,
  mergeSources,
  sourceTeams,
  type MultiFileSource,
  type DuplicateKind,
} from '@/lib/multiFileImporter';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const TYPE_LABELS: Record<ShiftType, string> = {
  long: 'Довга зміна (12 днів)',
  short: 'Коротка зміна (5 днів)',
  international: 'Міжнародна зміна',
  sports: 'Спортивна зміна ⚡',
};

export const MultiFileShiftModal: React.FC<Props> = ({ open, onOpenChange, onCreated }) => {
  const [sources, setSources] = useState<MultiFileSource[]>([]);
  const [sheetUrl, setSheetUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [rawTextInput, setRawTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Параметри зміни
  const [name, setName] = useState('');
  const [type, setType] = useState<ShiftType>('long');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [travelStart, setTravelStart] = useState('');
  const [hotelStart, setHotelStart] = useState('');
  const [showExtraDates, setShowExtraDates] = useState(false);

  // Стан виконання
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Об'єднана статистика та перевірка колізій
  const merged = useMemo(() => mergeSources(sources), [sources]);
  const isAnalyzingAny = sources.some((s) => s.status === 'analyzing');
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
    setShowUrlInput(false);
    void runAnalyze(s);
  };

  const addRawText = () => {
    if (!rawTextInput.trim()) return;
    const s = makeTextSource(rawTextInput.trim(), `Вставка тексту (${rawTextInput.trim().slice(0, 20)}...)`);
    setSources((prev) => [...prev, s]);
    setRawTextInput('');
    setShowTextInput(false);
    void runAnalyze(s);
  };

  const removeSource = (id: string) => setSources((prev) => prev.filter((s) => s.id !== id));

  const reset = () => {
    setSources([]);
    setSheetUrl('');
    setRawTextInput('');
    setShowUrlInput(false);
    setShowTextInput(false);
    setName('');
    setStart('');
    setEnd('');
    setTravelStart('');
    setHotelStart('');
    setShowExtraDates(false);
    setProgress(0);
    setProgressLabel('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (!name.trim() || !start || !end) {
      toast.error('Заповніть назву та обов’язкові дати зміни');
      return;
    }
    if (!merged.rows.length) {
      toast.error('Додайте хоча б один валідний файл з учасниками');
      return;
    }

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
          travel_start_date: travelStart || start,
          hotel_start_date: hotelStart || start,
        },
        sources,
        (pct, label) => {
          setProgress(pct);
          setProgressLabel(label);
        }
      );

      toast.success(`Зміну успішно створено · ${res.inserted} дітей із ${res.files} джерел!`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      toast.error(err?.message || 'Не вдалося створити зміну');
    } finally {
      setBusy(false);
    }
  };

  const getDuplicateBadge = (kind: DuplicateKind) => {
    switch (kind) {
      case 'cross_team':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px]">Міжкомандний збіг</Badge>;
      case 'exact':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px]">Повний дублікат</Badge>;
      case 'namesake':
        return <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[9px]">Однофамільці</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0B0F19]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 text-white space-y-4">
        <DialogHeader>
          <DialogTitle className="text-base font-bold uppercase tracking-wider text-[#FA5A15] flex items-center gap-2">
            <Upload className="w-5 h-5" /> Мульти-імпорт зміни
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Завантажте одночасно файли (PDF, Excel, CSV, Google Sheets, текст) та зведіть їх в єдину базу зміни.
          </DialogDescription>
        </DialogHeader>

        {/* Дропзона кількох файлів */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
            dragging ? 'border-[#FA5A15] bg-[#FA5A15]/10 scale-[0.99]' : 'border-white/15 bg-white/5 hover:border-white/30'
          }`}
        >
          <Upload className="mx-auto h-7 w-7 text-[#FA5A15]" strokeWidth={1.75} />
          <p className="mt-2 text-xs font-semibold text-slate-200">Перетягніть файли або натисніть для вибору</p>
          <p className="text-[10px] text-slate-500 mt-0.5">.xlsx · .xls · .csv · .pdf — можна обрати кілька файлів одночасно</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Додаткові джерела: Google Таблиця або Текст */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setShowUrlInput(!showUrlInput); setShowTextInput(false); }}
            className="h-9 rounded-xl bg-white/5 border-white/10 text-xs text-slate-300 hover:text-white"
          >
            <Link2 className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" />
            + Google Таблиця
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setShowTextInput(!showTextInput); setShowUrlInput(false); }}
            className="h-9 rounded-xl bg-white/5 border-white/10 text-xs text-slate-300 hover:text-white"
          >
            <Clipboard className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" />
            + Вставити текст зі списком
          </Button>
        </div>

        {showUrlInput && (
          <div className="flex gap-2 p-3 bg-white/5 border border-white/10 rounded-xl animate-in fade-in duration-200">
            <Input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="Вставте посилання на відкриту Google Таблицю..."
              className="h-10 rounded-xl bg-white/5 border-white/10 text-white text-xs"
            />
            <Button type="button" size="sm" onClick={addSheet} className="h-10 rounded-xl bg-[#FA5A15] hover:bg-[#FA5A15]/90 shrink-0">
              Додати
            </Button>
          </div>
        )}

        {showTextInput && (
          <div className="space-y-2 p-3 bg-white/5 border border-white/10 rounded-xl animate-in fade-in duration-200">
            <Textarea
              rows={4}
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              placeholder="Вставте скопійований текст списку (наприклад: 1. Іваненко Петро - ГОТЕЛЬ)..."
              className="rounded-xl bg-white/5 border-white/10 text-white text-xs"
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={addRawText} className="h-9 rounded-xl bg-[#FA5A15] hover:bg-[#FA5A15]/90">
                Обробити текст
              </Button>
            </div>
          </div>
        )}

        {/* Список завантажених джерел */}
        {sources.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
              <span>Завантажені джерела ({sources.length}):</span>
              <span>Готово: {readyCount} з {sources.length}</span>
            </div>

            {sources.map((s) => {
              const teams = s.status === 'ready' ? sourceTeams(s) : [];
              const count = s.result?.rows.filter((r) => r.full_name && r.team_number).length ?? 0;

              return (
                <div key={s.id} className="rounded-2xl border border-white/10 bg-white/5 p-3.5 space-y-2.5 transition-all">
                  <div className="flex items-center gap-2.5">
                    {s.kind === 'file' && <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-400" />}
                    {s.kind === 'sheet' && <Link2 className="h-4 w-4 shrink-0 text-sky-400" />}
                    {s.kind === 'text' && <FileText className="h-4 w-4 shrink-0 text-amber-400" />}

                    <span className="flex-1 truncate text-xs font-semibold text-slate-100">{s.label}</span>

                    {s.status === 'analyzing' && <Loader2 className="h-4 w-4 animate-spin text-[#FA5A15]" />}
                    {s.status === 'ready' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {s.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => void runAnalyze(s)}
                        title="Повторити"
                        className="text-amber-400 hover:text-amber-300 p-1"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => removeSource(s.id)}
                      className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {s.status === 'error' && (
                    <div className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-500/10 p-2 rounded-xl border border-red-500/20">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{s.error}</span>
                    </div>
                  )}

                  {s.status === 'ready' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-slate-300">
                          <Users className="mr-1 h-3 w-3 text-slate-400" />
                          {count} дітей
                        </Badge>

                        {teams.map((t) => (
                          <Badge key={t} className="bg-[#FA5A15]/20 text-[#FA5A15] text-[10px] border-0">
                            {t} команда
                          </Badge>
                        ))}
                      </div>

                      {/* Налаштування зсуву для конкретного джерела */}
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-slate-400 whitespace-nowrap">Зсув команд:</Label>
                        <Input
                          type="number"
                          min="0"
                          max="50"
                          value={s.teamOffset}
                          onChange={(e) => patch(s.id, { teamOffset: Number(e.target.value) || 0 })}
                          className="h-7 w-16 text-center rounded-lg bg-white/5 border-white/10 text-white text-xs px-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Попередження про дублікати та колізії */}
        {merged.summary.duplicates.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Виявлено колізії між файлами ({merged.summary.duplicates.length})
            </p>
            <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {merged.summary.duplicates.map((d) => (
                <div key={d.key} className="text-[11px] bg-black/20 p-2 rounded-xl flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-200">{d.fullName}</span>
                    {getDuplicateBadge(d.kind)}
                  </div>
                  <p className="text-slate-400 text-[10px]">
                    {d.description} · Джерела: {d.sources.join(' + ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Параметри зміни */}
        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-slate-300 font-semibold">Назва зміни</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="наприклад: Залізна Зміна №24 · Карпати"
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white text-xs"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-slate-300 font-semibold">Тип зміни</Label>
            <Select value={type} onValueChange={(v) => setType(v as ShiftType)}>
              <SelectTrigger className="h-11 rounded-xl bg-white/5 border-white/10 text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0F19] border-white/10 text-white">
                {(Object.keys(TYPE_LABELS) as ShiftType[]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs focus:bg-white/10 focus:text-white">
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300 font-semibold">Початок табору</Label>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300 font-semibold">Завершення табору</Label>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white text-xs"
            />
          </div>

          {/* Додаткові дати (потяг / готель) */}
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setShowExtraDates(!showExtraDates)}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors py-1"
            >
              <Calendar className="w-3.5 h-3.5 text-[#FA5A15]" />
              <span>{showExtraDates ? 'Приховати додаткові дати' : 'Налаштувати дати потяга / готелю (опціонально)'}</span>
              {showExtraDates ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showExtraDates && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 animate-in fade-in">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Дата виїзду потяга</Label>
                  <Input
                    type="date"
                    value={travelStart}
                    onChange={(e) => setTravelStart(e.target.value)}
                    className="h-9 rounded-xl bg-white/5 border-white/10 text-white text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Дата заселення в готель</Label>
                  <Input
                    type="date"
                    value={hotelStart}
                    onChange={(e) => setHotelStart(e.target.value)}
                    className="h-9 rounded-xl bg-white/5 border-white/10 text-white text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Підсумок сформованої бази */}
        {merged.rows.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-300">
              <span>Підсумок сформованої бази</span>
              <span className="text-[#FA5A15]">{merged.summary.uniqueRows} учасників</span>
            </div>

            <p className="text-xs text-slate-400">
              Джерел: {readyCount} · Всього записів у файлах: {merged.summary.totalRows} · Унікальних: {merged.summary.uniqueRows}
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {merged.summary.teams.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] bg-black/30 border-white/10 text-slate-200">
                  {t} команда: <span className="ml-1 font-bold text-[#FA5A15]">{merged.summary.perTeam[t] ?? 0}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Прогрес створення */}
        {busy && (
          <div className="space-y-1.5 py-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FA5A15] to-amber-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 text-center font-medium">
              {progressLabel} · {progress}%
            </p>
          </div>
        )}

        <Button
          onClick={submit}
          disabled={busy || !merged.rows.length || isAnalyzingAny}
          className="h-12 w-full rounded-xl bg-[#FA5A15] font-bold text-white hover:bg-[#FA5A15]/90 transition-all shadow-lg shadow-[#FA5A15]/20 disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Створення зміни...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Створити зміну ({merged.summary.uniqueRows} учасників)
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default MultiFileShiftModal;
