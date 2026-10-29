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
import { previewScheduleImport, scheduleImportKey } from "@/lib/scheduleImport";
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
  const [newestEvent, setNewestEvent] = useState('');
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
    setNewestEvent('');
    setEditing(false);
    const streamPreview = new ScheduleStreamPreview(date);
    try {
      const result = await generateSchedule(rawText.trim(), date, request.signal, (text) => {
        if (!request.signal.aborted) {
          const events = streamPreview.update(text);
          if (events) {
            setLiveJson(events);
            const latest = previewScheduleImport(events, date);
            const source: { date: string; title: string; time_start: string; location?: string; target_teams?: number[] }[] = JSON.parse(events);
            const last = source.at(-1);
            if (last && latest.total) setNewestEvent(`${last.date}|${scheduleImportKey(last)}`);
          }
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
    const days = preview.days.map((day) => day.date !== dayDate ? day : { ...day, items: day.items.map((item, position) => position !== index ? item : {
      ...item, [field]: value || null,
      description: field === 'title' ? item.description : item.description?.replace(/завершення\s+орієнтовне[.!]?/ig, '').trim() || null,
    }) });
    const next = JSON.stringify({ days });
    const check = previewScheduleImport(next, date);
    if (check.errors.length || check.total !== preview.total) {
      toast.error(check.errors[0] ?? 'Зміна створює повтор події');
      return;
    }
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

  const displayedPreview = generating ? livePreview : preview;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent aria-describedby={undefined} className="flex h-[min(780px,calc(100dvh-1rem))] max-w-4xl max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:p-0" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader className="border-b border-border px-5 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2 text-xl"><CalendarDays className="size-5 text-primary" />Розклад зміни</DialogTitle>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => { if (!generating && !busy) { setMode(value); setEditing(false); } }} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai" disabled={busy || generating}><Sparkles className="mr-2 size-4" />Генерація ШІ</TabsTrigger>
              <TabsTrigger value="manual" disabled={busy || generating}><FileJson className="mr-2 size-4" />Ручний ввід</TabsTrigger>
            </TabsList>
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,0.8fr)_minmax(0,1.2fr)] overflow-hidden md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:grid-rows-[minmax(0,1fr)]">
            <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto overscroll-contain border-b border-border p-5 md:border-b-0 md:border-r">
              <div className="space-y-2">
                <Label htmlFor="schedule-raw-text">Текст розкладу</Label>
                <Textarea id="schedule-raw-text" disabled={busy || generating} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="08:00 Підйом\n08:30–09:00 Сніданок\n09:30 Команда 1 — майстер-клас…" className="min-h-[180px] text-sm leading-relaxed" />
                <div className="flex justify-between text-xs text-muted-foreground"><span>{date}</span><span className="tabular-nums">{rawText.length.toLocaleString('uk-UA')} / 25 000</span></div>
              </div>
              <TabsContent value="ai" className="mt-0 space-y-3">
                {generating ? <Button variant="outline" onClick={() => controller.current?.abort()} className="h-11 w-full"><Square className="mr-2 size-4" />Зупинити генерацію</Button> : <Button onClick={generate} disabled={busy || !rawText.trim() || rawText.length > 25000} className="h-11 w-full"><Sparkles className="mr-2 size-4" />{aiJson ? 'Згенерувати ще раз' : 'Згенерувати розклад'}</Button>}
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Gemini 3.5 Flash-Lite</span>{generating && <span role="status" className="flex items-center gap-2"><Loader2 className="size-3 animate-spin" />{livePreview?.total ?? 0} подій</span>}</div>
                {generationError && <p role="alert" className="break-words text-sm text-destructive">{generationError}</p>}
              </TabsContent>
              <TabsContent value="manual" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-2"><Button disabled={busy} variant="outline" onClick={copyPrompt} className="h-auto min-h-11 whitespace-normal text-xs"><ClipboardCopy className="mr-2 size-4 shrink-0" />Скопіювати запит</Button><Button disabled={busy} variant="outline" onClick={openAiStudio} className="h-auto min-h-11 whitespace-normal text-xs"><ExternalLink className="mr-2 size-4 shrink-0" />Google AI Studio</Button></div>
                <div className="space-y-2"><Label htmlFor="schedule-json">Готовий JSON</Label><Textarea id="schedule-json" disabled={busy} value={manualJson} onChange={(event) => { setManualJson(event.target.value); setCheckedManualJson(null); }} placeholder='[{"date":"…","items":[…]}]' className="min-h-[160px] font-mono text-xs" /></div>
                <Button variant="outline" onClick={() => setCheckedManualJson(manualJson)} disabled={busy || !manualJson.trim()} className="h-11 w-full"><Eye className="mr-2 size-4" />Перевірити розклад</Button>
              </TabsContent>
              {rawText.length > 25000 && <p role="alert" className="text-sm text-destructive">Текст завеликий — розділіть його на частини до 25 000 символів.</p>}
            </div>
            <div className="min-h-0 min-w-0 overflow-hidden p-4 md:p-5">
              {displayedPreview ? <ScheduleImportReview preview={displayedPreview} newestEvent={newestEvent} live={generating} editing={editing} onEditingChange={setEditing} onEdit={editEvent} /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground"><CalendarDays className="size-8" /><p className="text-sm">{generating ? 'Очікуємо першу подію…' : 'Попередній перегляд'}</p>{generating && <Loader2 className="size-4 animate-spin" />}</div>}
            </div>
          </div>
        </Tabs>
        <div className="shrink-0 border-t border-border bg-background p-4">
          <Button onClick={publish} disabled={busy || generating || !preview || preview.errors.length > 0 || !preview.total} className="h-12 w-full">
            {busy ? <><Loader2 className="mr-2 size-4 animate-spin" />Зберігаємо чернетку…</> : <><CheckCircle2 className="mr-2 size-4" />Зберегти перевірену чернетку</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminAiStudioImportModal;
