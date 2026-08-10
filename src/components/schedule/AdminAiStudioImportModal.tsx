import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardCopy, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateAiStudioSchedulePrompt } from "@/lib/schedule-prompt-generator";
import { cleanAndParseScheduleJson } from "@/lib/json-sanitizer";
import { broadcastScheduleUpdated } from "@/lib/schedule";
import { normalizeTime } from "@/lib/scheduleCategories";
import { pickActiveShift } from "@/lib/shift";
import type { Shift } from "@/types/app";

const AI_STUDIO_URL = "https://aistudio.google.com/prompts/new_chat";

interface Props {
  open: boolean;
  date: string;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedItem {
  time_start?: string | null;
  time_end?: string | null;
  title?: string;
  location?: string | null;
  category?: string | null;
  target_teams?: number[] | null;
  has_sub_slots?: boolean | null;
  sub_slots?: { time: string; teams: number[] }[] | null;
}

const AdminAiStudioImportModal = ({ open, date, onOpenChange, onImported }: Props) => {
  const [rawText, setRawText] = useState("");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);

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
      document.execCommand("copy");
      ta.remove();
    }
    toast.success("Промт скопійовано! Вставте його в AI Studio");
  };

  /** Schedule row of this date (created on demand as a DRAFT). */
  const ensureSchedule = async (): Promise<string> => {
    const { data: existing } = await supabase.from("schedules").select("*").eq("date", date);
    const row = (existing || [])[0];
    if (row) return row.id;
    const { data: shifts } = await supabase
      .from("shifts")
      .select("*")
      .is("deleted_at", null)
      .order("start_date", { ascending: false });
    const active = pickActiveShift((shifts || []) as Shift[]);
    const { data, error } = await supabase
      .from("schedules")
      .insert({ shift_id: active?.id ?? null, date, raw_text: rawText.trim() || null, is_published: false })
      .select()
      .single();
    if (error || !data) throw error;
    return data.id;
  };

  const publish = async () => {
    let parsed: { items?: ParsedItem[] };
    try {
      parsed = cleanAndParseScheduleJson(json);
      if (!parsed?.items || !Array.isArray(parsed.items)) {
        throw new Error('JSON не містить масиву "items"');
      }
    } catch (err: any) {
      toast.error("Помилка синтаксису JSON", {
        description: err?.message || "Перевірте вставлений текст",
      });
      return;
    }
    const items = parsed.items as ParsedItem[];
    if (!items.length) {
      toast.error("У JSON немає жодної події (items)");
      return;
    }

    setBusy(true);
    try {
      const scheduleId = await ensureSchedule();
      const rows = items
        .filter((i) => (i.title || "").trim())
        .map((i, idx) => ({
          schedule_id: scheduleId,
          title: String(i.title).trim(),
          description: null,
          location: i.location ? String(i.location).trim() : null,
          time_start: normalizeTime(i.time_start || "") || null,
          time_end: normalizeTime(i.time_end || "") || null,
          category: i.category || "general",
          target_teams: (Array.isArray(i.target_teams) ? i.target_teams : []) as unknown as any,
          order_index: idx,
          has_sub_slots: Boolean(i.has_sub_slots && i.sub_slots?.length),
          sub_slots: (Array.isArray(i.sub_slots) ? i.sub_slots : []) as unknown as any,
        }));

      const { error } = await supabase.from("schedule_items").insert(rows);
      if (error) throw error;

      await broadcastScheduleUpdated({ date, action: "SCHEDULE_MUTATED", source: "ai-studio", count: rows.length });
      toast.success(`Збережено як чернетку: ${rows.length} подій`, {
        description: "Перевір розклад і натисни «Опублікувати розклад» у редакторі дня.",
      });
      setJson("");
      onOpenChange(false);
      onImported();
    } catch (e: any) {
      toast.error(e?.message || "Помилка збереження розкладу");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Імпорт розкладу через AI Studio</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Крок 1 — сирий текст розкладу
            </Label>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Встав сюди текст розкладу на день…"
              className="min-h-[140px] text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Крок 2 — згенеруй JSON у ШІ
            </Label>
            <Button onClick={copyPrompt} className="w-full h-11 text-xs font-bold uppercase">
              <ClipboardCopy className="w-4 h-4 mr-1.5" /> Скопіювати запит для ШІ
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 text-xs font-bold uppercase"
              onClick={() => window.open(AI_STUDIO_URL, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="w-4 h-4 mr-1.5" /> Перейти в Google AI Studio
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Крок 3 — вставити готовий JSON з AI Studio
            </Label>
            <Textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='{"date":"…","items":[…]}'
              className="min-h-[140px] font-mono text-[11px]"
            />
          </div>

          <Button onClick={publish} disabled={busy || !json.trim()} className="w-full h-12 text-xs font-bold uppercase">
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Завантажити як чернетку
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminAiStudioImportModal;
