import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import type { TalentAttachment, TalentEntry } from '@/types/app';
import TalentAttachmentsManager from '@/components/talent/TalentAttachmentsManager';
import { parseAttachments, persistAttachments } from '@/lib/talentMedia';

interface Props {
  entry: TalentEntry | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const BREAK_OPTIONS = [0, 1, 2, 3];

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
    if (!entry) return;
    setTitle(entry.title ?? '');
    setDescription(entry.description ?? '');
    setTechnicalNotes(entry.technical_notes ?? '');
    setBreaks(entry.break_needed_after ?? 0);
    setAttachments(parseAttachments(entry.attachments));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, open]);

  /** Файли зберігаються миттєво, окремо від кнопки «Зберегти зміни» */
  const handleAttachmentsChange = async (next: TalentAttachment[]) => {
    setAttachments(next);
    if (!entry) return;
    const { error } = await persistAttachments(entry.id, next);
    if (error) { toast.error('Не вдалося зберегти список файлів'); return; }
    onSaved?.();
  };

  const save = async () => {
    if (!entry) return;
    if (!title.trim()) { toast.error('Назва номера обовʼязкова'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('talent_entries')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        technical_notes: technicalNotes.trim(),
        break_needed_after: breaks,
        pause_after: breaks,
      })
      .eq('id', entry.id);
    setSaving(false);
    if (error) { toast.error('Не вдалося зберегти зміни'); return; }
    haptics.notification('success');
    toast.success('Зміни збережено');
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] flex flex-col p-0 overflow-hidden bg-[#0F1523]/95 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-3xl z-50 text-slate-100">
        <DialogHeader className="p-5 pb-3 border-b border-white/10 shrink-0 text-left">
          <DialogTitle className="text-lg font-black uppercase tracking-wide">Редагувати номер</DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
          <div className="space-y-1.5">
            <Label htmlFor="talent-title" className="text-xs font-semibold uppercase text-muted-foreground">Назва виступу *</Label>
            <Input
              id="talent-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 bg-black/30 border-white/10"
              placeholder="Наприклад, Танець «Гуцулка»"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="talent-desc" className="text-xs font-semibold uppercase text-muted-foreground">Опис / Учасники / Реквізит</Label>
            <Textarea
              id="talent-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-black/30 border-white/10 resize-none text-sm"
              placeholder="Хто виступає, що потрібно на сцені…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="talent-tech" className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#FA5A15]" /> Технічні побажання для звуку / світла
            </Label>
            <Textarea
              id="talent-tech"
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              rows={3}
              className="bg-black/30 border-white/10 resize-none text-sm"
              placeholder="Напр.: два мікрофони, тепле світло, фонограма з 0:12, дим на приспіві"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Скільки виступів перерви потрібно після номера</Label>
            <div className="grid grid-cols-4 gap-2">
              {BREAK_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { haptics.selection(); setBreaks(n); }}
                  className={`h-11 rounded-xl border text-sm font-bold transition-smooth ${
                    breaks === n
                      ? 'bg-[#FA5A15] text-white border-[#FA5A15]'
                      : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Пауза вимірюється кількістю виступів, напр. 2 — щоб встигнути перевдягнутися.</p>
          </div>

          <div className="pt-1 border-t border-white/10">
            <div className="pt-3">
              <TalentAttachmentsManager
                teamNumber={entry?.team_number ?? 0}
                attachments={attachments}
                onChange={handleAttachmentsChange}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-white/10 bg-black/30 backdrop-blur-sm flex flex-row gap-2 justify-end shrink-0">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none h-11 font-bold uppercase text-xs">
            Закрити
          </Button>
          <Button type="button" onClick={save} disabled={saving || !title.trim()} className="flex-1 sm:flex-none h-11 bg-[#FA5A15] hover:bg-[#FA5A15]/90 text-white font-bold uppercase text-xs">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Зберегти зміни</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TalentEntryEditDialog;
