import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardCopy, ExternalLink, Loader2, CheckCircle2, Eye, Sparkles, Square, FileJson, CalendarDays } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScheduleImportReview } from './ScheduleImportReview';
import { ScheduleStreamPreview } from '@/lib/scheduleStreamPreview';
import { toast } from "sonner";
import { generateAiStudioSchedulePrompt } from "@/lib/schedule-prompt-generator";
import { previewScheduleImport } from "@/lib/scheduleImport";
import { saveScheduleImport } from "@/lib/saveScheduleImport";
import { useActiveShift } from "@/context/ActiveShiftContext";
import { generateSchedule } from '@/lib/generateSchedule';

const AI_STUDIO_URL = "https://aistudio.google.com/prompts/new_chat";

interface Props {
  open: boolean;
  date: string;
  onOpenChange: (open: boolean) => void;
  onImported: (firstDate?: string) => void;
}

const AdminAiStudioImportModal = ({ open, date, onOpenChange, onImported }: Props) => {
  const { shiftId } = useActiveShift();
  const [rawText, setRawText] = useState("");
  const [aiJson, setAiJson] = useState('');
  const [manualJson, setManualJson] = useState('');
  const [mode, setMode] = useState('ai');
  const json = mode === 'ai' ? aiJson : manualJson;
  const setJson = mode === 'ai' ? setAiJson : setManualJson;
  const [liveJson, setLiveJson] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [checkedAiJson, setCheckedAiJson] = useState<string | null>(null);
  const [checkedManualJson, setCheckedManualJson] = useState<string | null>(null);
  const checkedJson = mode === 'ai' ? checkedAiJson : checkedManualJson;
  const setCheckedJson = mode === 'ai' ? setCheckedAiJson : setCheckedManualJson;
  const preview = useMemo(() => checkedJson === json && json ? previewScheduleImport(json, date) : null, [checkedJson, json, date]);
  const livePreview = useMemo(() => liveJson ? previewScheduleImport(liveJson, date) : null, [liveJson, date]);
  const changeOpen = (next: boolean) => {
    if (saving.current) return;
    if (!next) controller.current?.abort();
    onOpenChange(next);
  };
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => { if (!open) controller.current?.abort(); }, [open]);

  const generate = async () => {
    if (controller.current || busy || !rawText.trim()) return;
    const request = new AbortController();
    controller.current = request;
    setGenerating(true);
    setGenerationError('');
    setCheckedJson(null);
    setJson('');
    setLiveJson('');
    setEditing(false);
    const streamPreview = new ScheduleStreamPreview(date);
    try {
      const result = await generateSchedule(rawText.trim(), date, request.signal, (text) => {
        if (!request.signal.aborted) {
          const events = streamPreview.update(text);
          if (events) setLiveJson(events);
        }
      });
      if (!request.signal.aborted) { setJson(result); setCheckedJson(result); }
    } catch (error: unknown) {
      setJson('');
      setLiveJson('');
      if (!request.signal.aborted) setGenerationError(error instanceof Error ? error.message : 'Не вдалося згенерувати розклад');
    } finally {
      if (controller.current === request) { controller.current = null; setGenerating(false); }
    }
  };

  const editEvent = (dayDate: string, index: number, field: 'title' | 'time_start' | 'time_end', value: string) => {
    if (!preview || busy || generating) return;
    const days = preview.days.map((day) => day.date !== dayDate ? day : { ...day, items: day.items.map((item, position) => position !== index ? item : { ...item, [field]: value || null }) });
    const next = JSON.stringify({ days });
    setJson(next);
    setCheckedJson(next);
  };

  const openAiStudio = () => {
    try {
      const a = document.createElement("a");
      a.href = AI_STUDIO_URL;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      try {
        const win = window.open(AI_STUDIO_URL, "_blank", "noopener,noreferrer");
        if (!win) throw new Error("popup_blocked");
      } catch {
        toast.error("Не вдалося відкрити вкладку", {
          description: "Дозволь спливаючі вікна або відкрий: aistudio.google.com",
        });
      }
    }
  };

  const copyPrompt = async () => {
    if (!rawText.trim()) {
      toast.error("Спочатку встав текст розкладу");
      return;
    }
    const prompt = generateAiStudioSchedulePrompt(rawText.trim(), date);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      const copied = document.execCommand("copy");
      ta.remove();
      if (!copied) { toast.error("Не вдалося скопіювати запит"); return; }
    }
    toast.success("Промт скопійовано! Вставте його в AI Studio");
  };

  const publish = async () => {
    if (saving.current || generating || !preview || preview.errors.length || !preview.total) return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await saveScheduleImport(preview.days, shiftId, rawText);
      const firstDate = preview.days[0]?.date;
      if (result.total) {
        // Drafts are not announced as published events to participants.
        toast.success(`Збережено як чернетку: ${result.total} подій`, {
          description: result.skipped ? `Уже наявних подій: ${result.skipped}` : 'Перевірте редактор дня перед публікацією.',
        });
      } else toast.info("Нових подій немає — усі вже є в розкладі");
      setJson("");
      setCheckedJson(null);
      onOpenChange(false);
      onImported(firstDate);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Помилка збереження розкладу");
      onImported();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent aria-describedby={undefined} className="flex max-w-4xl max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Імпорт розкладу</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="schedule-raw-text" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Крок 1 — сирий текст розкладу
            </Label>
            <Textarea
              id="schedule-raw-text"
              disabled={busy || generating}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Встав сюди текст розкладу на один або кілька днів (наприклад 11.08 – 15.08)…"
              className="min-h-[140px] text-xs"
            />
          </div>

          <div className="space-y-2">
            {generating ? <Button variant="outline" onClick={() => controller.current?.abort()} className="w-full h-11">
              <Square className="size-4 mr-2" /> Зупинити генерацію
            </Button> : <Button onClick={generate} disabled={busy || !rawText.trim() || rawText.length > 25000} className="w-full h-12">
              <Sparkles className="size-4 mr-2" /> Згенерувати розклад
            </Button>}
            <p className="text-xs text-muted-foreground">Gemini 3.5 Flash-Lite</p>
            {generating && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Розпізнаємо дати, події та команди…</p>}
            {rawText.length > 25000 && <p role="alert" className="text-sm text-destructive">Текст завеликий — розділіть його на частини до 25 000 символів.</p>}
            {generationError && <p role="alert" className="text-sm text-destructive break-words">{generationError}</p>}
          </div>

          <details className="space-y-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">Імпорт вручну через AI Studio</summary>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Крок 2 — згенеруй JSON у ШІ
            </Label>
            <Button disabled={busy || generating} onClick={copyPrompt} className="w-full h-11 text-xs font-bold uppercase">
              <ClipboardCopy className="w-4 h-4 mr-1.5" /> Скопіювати запит для ШІ
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 text-xs font-bold uppercase"
              type="button"
              onClick={openAiStudio}
            >
              <ExternalLink className="w-4 h-4 mr-1.5" /> Перейти в Google AI Studio
            </Button>
          </details>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-json" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Крок 3 — вставити готовий JSON з AI Studio
            </Label>
            <Textarea
              id="schedule-json"
              disabled={busy || generating}
              value={json}
              onChange={(e) => { setJson(e.target.value); setCheckedJson(null); }}
              placeholder='[{"date":"…","items":[…]}, …]'
              className="min-h-[140px] font-mono text-[11px]"
            />
          </div>

          <Button variant="outline" onClick={() => setCheckedJson(json)} disabled={busy || generating || !json.trim()} className="w-full h-11">
            <Eye className="size-4 mr-2" /> Перевірити розклад
          </Button>

          {preview && (
            <section className="space-y-3 border-y border-border py-4" aria-label="Перевірка розкладу" aria-live="polite">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{preview.total} подій · {preview.days.length} дн.</h3>
                {preview.duplicates > 0 && <span className="text-xs text-muted-foreground">Повторів прибрано: {preview.duplicates}</span>}
              </div>
              {preview.errors.length > 0 && <div role="alert" className="space-y-1 text-sm text-destructive">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Виправте помилки перед збереженням</p>
                <ul className="list-disc space-y-1 pl-5 break-words">{preview.errors.slice(0, 20).map((error, index) => <li key={index}>{error}</li>)}</ul>
                {preview.errors.length > 20 && <p>Ще помилок: {preview.errors.length - 20}</p>}
              </div>}
              {preview.warnings.length > 0 && <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Зверніть увагу: {preview.warnings.length}</summary>
                <ul className="list-disc space-y-1 pl-5 pt-2">{preview.warnings.slice(0, 30).map((warning, index) => <li key={index}>{warning}</li>)}</ul>
              </details>}
              <div className="max-h-64 overflow-y-auto space-y-4">
                {preview.days.map((day) => <div key={day.date}>
                  <h4 className="sticky top-0 bg-background py-2 text-sm font-semibold">{day.date} <span className="text-muted-foreground">· {day.items.length}</span></h4>
                  <ul className="divide-y divide-border">{day.items.slice(0, 100).map((item, index) => <li key={index} className="py-2 text-sm">
                    <div className="flex gap-3"><span className="shrink-0 font-mono text-xs tabular-nums pt-0.5">{item.time_start}{item.time_end ? `–${item.time_end}` : ''}</span><span className="min-w-0 break-words font-medium">{item.title}</span></div>
                    <p className="mt-1 text-xs text-muted-foreground break-words">{item.target_teams.length ? `Команди ${item.target_teams.join(', ')}` : 'Усі команди'}{item.location ? ` · ${item.location}` : ''}{item.sub_slots.length ? ` · Заїздів: ${item.sub_slots.length}` : ''}</p>
                    {item.description && <p className="mt-1 text-xs text-muted-foreground break-words">{item.description}</p>}
                  </li>)}</ul>
                  {day.items.length > 100 && <p className="text-xs text-muted-foreground">Ще {day.items.length - 100} подій перевірено</p>}
                </div>)}
              </div>
            </section>
          )}

          <Button onClick={publish} disabled={busy || generating || !preview || preview.errors.length > 0 || !preview.total} className="w-full h-12 text-xs font-bold uppercase">
            {busy ? <><Loader2 className="size-4 mr-2 animate-spin" /> Зберігаємо чернетку…</> : <><CheckCircle2 className="size-4 mr-2" /> Зберегти перевірену чернетку</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminAiStudioImportModal;
