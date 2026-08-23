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
      <DialogContent className="bg-gradient-card gpu-accelerated w-[calc(100vw-2rem)] max-w-[26rem] sm:max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-black uppercase">Редагувати номер</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Назва номера</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Танець «Вогонь»" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Опис / Учасники / Реквізит</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Хто виступає, що потрібно на сцені, музика…"
              className="text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Скільки номерів перерви потрібно після виступу</Label>
            <div className="grid grid-cols-4 gap-2">
              {BREAK_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { haptics.selection(); setBreaks(n); }}
                  className={`h-11 rounded-xl border text-sm font-bold transition-smooth ${
                    breaks === n
                      ? 'bg-gradient-primary text-primary-foreground border-transparent'
                      : 'bg-surface-1 border-border/50 text-muted-foreground'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Наприклад, 2 — щоб встигнути переодягнутись.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="h-11 font-bold uppercase text-xs">Скасувати</Button>
          <Button onClick={save} disabled={saving} className="h-11 font-bold uppercase text-xs">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Зберегти зміни</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TalentEntryEditDialog;
