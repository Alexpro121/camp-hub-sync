import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import type { TalentEntry } from '@/types/app';

interface Props {
  entry: TalentEntry | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const BREAK_OPTIONS = [0, 1, 2, 3];

/** Edit an existing talent act: title, description/props and required break. */
const TalentEntryEditDialog = ({ entry, open, onClose, onSaved }: Props) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [breaks, setBreaks] = useState(0);
  const [saving, setSaving] = useState(false);
  const haptics = useHaptics();

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title ?? '');
    setDescription(entry.description ?? '');
    setBreaks(entry.break_needed_after ?? 0);
  }, [entry?.id, open]);

  const save = async () => {
    if (!entry) return;
    if (!title.trim()) { toast.error('Назва номера обовʼязкова'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('talent_entries')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        break_needed_after: breaks,
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
      <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-lg max-h-[90dvh] flex flex-col p-0 overflow-hidden bg-gradient-card border border-border/60 shadow-2xl rounded-2xl z-50">
        <DialogHeader className="p-5 pb-3 border-b border-border/40 shrink-0 text-left">
          <DialogTitle className="text-lg font-black uppercase tracking-wide">Редагувати номер</DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
          <div className="space-y-1.5">
            <Label htmlFor="talent-title" className="text-xs font-semibold uppercase text-muted-foreground">Назва виступу *</Label>
            <Input
              id="talent-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 bg-surface-1"
              placeholder="Наприклад, Танець «Вогонь»"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="talent-desc" className="text-xs font-semibold uppercase text-muted-foreground">Опис / Учасники / Реквізит</Label>
            <Textarea
              id="talent-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-surface-1 resize-none text-sm"
              placeholder="Хто виступає, що потрібно на сцені, посилання на фонограму…"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Скільки номерів перерви потрібно після виступу</Label>
            <div className="grid grid-cols-4 gap-2">
              {BREAK_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { haptics.selection(); setBreaks(n); }}
                  className={`h-11 rounded-xl border text-sm font-bold transition-smooth ${
                    breaks === n
                      ? 'bg-gradient-primary text-primary-foreground border-primary shadow-glow'
                      : 'bg-surface-1 border-border/40 text-foreground hover:bg-surface-2'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Наприклад, 2 — щоб встигнути переодягнутися.</p>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border/40 bg-surface-1/80 backdrop-blur-sm flex flex-row gap-2 justify-end shrink-0">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none h-11 font-bold uppercase text-xs">
            Скасувати
          </Button>
          <Button type="button" onClick={save} disabled={saving || !title.trim()} className="flex-1 sm:flex-none h-11 bg-gradient-primary font-bold uppercase text-xs shadow-glow">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Зберегти зміни</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


export default TalentEntryEditDialog;
