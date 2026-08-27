import { useEffect, useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  Save, 
  SlidersHorizontal, 
  Sparkles, 
  FileText, 
  Clock, 
  Minus, 
  Plus, 
  Music,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import type { TalentAttachment, TalentEntry } from '@/types/app';
import TalentAttachmentsManager from '@/components/talent/TalentAttachmentsManager';
import { STAGE_MEDIA_FEATURE_ENABLED } from '@/lib/fair';
import { parseAttachments, persistAttachments } from '@/lib/talentMedia';

interface Props {
  entry: TalentEntry | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/** Схилення слова «виступ» для української мови */
const getBreakPluralWord = (n: number): string => {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'виступів';
  if (rem > 1 && rem < 5) return 'виступи';
  if (rem === 1) return 'виступ';
  return 'виступів';
};

/** Редагування номера: назва, опис, технічні побажання, пауза та медіафайли */
const TalentEntryEditDialog = ({ entry, open, onClose, onSaved }: Props) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [technicalNotes, setTechnicalNotes] = useState('');
  const [breaks, setBreaks] = useState(0);
  const [attachments, setAttachments] = useState<TalentAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const haptics = useHaptics();

  useEffect(() => {
    if (!entry || !open) return;
    setTitle(entry.title ?? '');
    setDescription(entry.description ?? '');
    setTechnicalNotes(entry.technical_notes ?? '');
    // Підтягуємо збережене значення перерви з бази з урахуванням обох можливих колонок
    const initialBreaks = Number(entry.break_needed_after ?? (entry as any).pause_after ?? 0);
    setBreaks(Math.max(0, initialBreaks));
    setAttachments(parseAttachments(entry.attachments));
  }, [entry, open]);

  /** Файли зберігаються миттєво при додаванні/видаленні/перейменуванні */
  const handleAttachmentsChange = async (next: TalentAttachment[]) => {
    setAttachments(next);
    if (!entry) return;
    try {
      const { error } = await persistAttachments(entry.id, next);
      if (error) {
        haptics.notification('error');
        toast.error('Не вдалося оновити список медіафайлів');
        return;
      }
      haptics.impact('light');
      onSaved?.();
    } catch {
      toast.error('Помилка збереження файлів');
    }
  };

  const handleBreakChange = (delta: number) => {
    haptics.impact('light');
    setBreaks((prev) => Math.max(0, Math.min(10, prev + delta)));
  };

  const save = async () => {
    if (!entry) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      haptics.notification('warning');
      toast.error('Назва номера обовʼязкова для заповнення');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('talent_entries')
        .update({
          title: cleanTitle,
          description: description.trim() || null,
          technical_notes: technicalNotes.trim(),
          break_needed_after: breaks,
          pause_after: breaks,
        })
        .eq('id', entry.id);

      if (error) throw error;

      haptics.notification('success');
      toast.success('Зміни до виступу успішно збережено!');
      onSaved?.();
      onClose();
    } catch (err: any) {
      haptics.notification('error');
      toast.error(err?.message || 'Не вдалося зберегти зміни');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && !v && onClose()}>
      <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] flex flex-col p-0 overflow-hidden bg-[#0A0E18]/95 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-3xl z-50 text-slate-100">
        
        {/* Шапка модального вікна */}
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-white/10 shrink-0 text-left flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-[#FA5A15]" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg font-black uppercase tracking-wide text-white truncate">
                Редагувати номер
              </DialogTitle>
              {entry?.team_number && (
                <p className="text-[11px] font-mono text-[#FA5A15] font-semibold">
                  Команда №{entry.team_number}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Тіло форми з плавним скролом */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
          
          {/* 1. Назва виступу */}
          <div className="space-y-1.5">
            <Label htmlFor="talent-title" className="text-xs font-semibold uppercase text-slate-300 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-[#FA5A15]" /> Назва виступу <span className="text-[#FA5A15]">*</span>
            </Label>
            <Input
              id="talent-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 bg-black/40 border-white/10 rounded-xl focus-visible:ring-[#FA5A15] text-sm text-white placeholder:text-slate-500"
              placeholder="Наприклад: Авторська пісня «Залізні крила»"
              disabled={saving}
            />
          </div>

          {/* 2. Опис та учасники */}
          <div className="space-y-1.5">
            <Label htmlFor="talent-desc" className="text-xs font-semibold uppercase text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Опис / Учасники / Реквізит
            </Label>
            <Textarea
              id="talent-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-black/40 border-white/10 rounded-xl focus-visible:ring-[#FA5A15] resize-none text-sm text-white placeholder:text-slate-500 leading-relaxed"
              placeholder="Хто саме виступає, який реквізит потрібен на сцені…"
              disabled={saving}
            />
          </div>

          {/* 3. Технічні побажання */}
          <div className="space-y-1.5">
            <Label htmlFor="talent-tech" className="text-xs font-semibold uppercase text-slate-300 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#FA5A15]" /> Технічні побажання (Звук / Світло / FOH)
            </Label>
            <Textarea
              id="talent-tech"
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              rows={2}
              className="bg-black/40 border-white/10 rounded-xl focus-visible:ring-[#FA5A15] resize-none text-sm text-white placeholder:text-slate-500 leading-relaxed"
              placeholder="Наприклад: 2 радіомікрофони на стійках, приглушене синє світло, старт треку з 0:15"
              disabled={saving}
            />
          </div>

          {/* 4. ОНОВЛЕНИЙ ЧИСЛОВИЙ КОНТРОЛЕР ПАУЗИ */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="talent-breaks-input" className="text-xs font-semibold uppercase text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#FA5A15]" /> Пауза (перерва) після номера
              </Label>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#FA5A15]/15 text-[#FA5A15] border border-[#FA5A15]/30">
                {breaks === 0 ? 'Без перерви' : `${breaks} ${getBreakPluralWord(breaks)}`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Stepper контролер: [-] [ Число ] [+] */}
              <div className="flex items-center bg-black/50 border border-white/15 rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleBreakChange(-1)}
                  disabled={saving || breaks <= 0}
                  className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white transition-all"
                  aria-label="Зменшити кількість виступів перерви"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <Input
                  id="talent-breaks-input"
                  type="number"
                  min={0}
                  max={10}
                  value={breaks}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setBreaks(isNaN(val) ? 0 : Math.max(0, Math.min(10, val)));
                  }}
                  disabled={saving}
                  className="w-14 h-10 text-center font-mono font-bold text-base bg-transparent border-0 focus-visible:ring-0 text-white p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />

                <button
                  type="button"
                  onClick={() => handleBreakChange(1)}
                  disabled={saving || breaks >= 10}
                  className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 active:scale-90 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white transition-all"
                  aria-label="Збільшити кількість виступів перерви"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="text-[11px] text-slate-400 leading-tight flex-1">
                Кількість виступів інших команд між цим номером та наступним виходом, щоб учасники встигли перевдягнутися.
              </div>
            </div>
          </div>

          {/* 5. Менеджер медіафайлів тимчасово вимкнено (STAGE_MEDIA_FEATURE_ENABLED) */}
          {STAGE_MEDIA_FEATURE_ENABLED && (
            <div className="pt-2 border-t border-white/10">
              <TalentAttachmentsManager
                teamNumber={entry?.team_number ?? 0}
                attachments={attachments}
                onChange={handleAttachmentsChange}
              />
            </div>
          )}
        </div>

        {/* Фіксований мобільний футер */}
        <DialogFooter className="p-3.5 sm:p-4 border-t border-white/10 bg-black/40 backdrop-blur-md flex flex-row gap-2.5 justify-end shrink-0">
          <Button 
            type="button" 
            variant="ghost" 
            onClick={onClose} 
            disabled={saving}
            className="flex-1 sm:flex-none h-11 px-4 font-bold uppercase text-xs rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 active:scale-95 transition-all"
          >
            Закрити
          </Button>
          <Button 
            type="button" 
            onClick={save} 
            disabled={saving || !title.trim()} 
            className="flex-[1.4] sm:flex-none h-11 px-5 bg-[#FA5A15] hover:bg-[#FF7D3B] text-white font-bold uppercase text-xs rounded-xl shadow-lg shadow-[#FA5A15]/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>Збереження...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                <span>Зберегти зміни</span>
              </>
            )}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};

export default TalentEntryEditDialog;
