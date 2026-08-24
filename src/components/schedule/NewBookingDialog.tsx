import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Building2, Loader2 } from 'lucide-react';
import { HALLS_LIST, type HallBooking, type HallId } from '@/types/halls';
import {
  checkSlotAvailability,
  conflictMessage,
  fromMinutes,
  timeOptions,
  toMinutes,
  validateRange,
} from '@/lib/halls';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookings: HallBooking[];
  hallId: HallId;
  date: string;
  /** Попередньо вибраний час зі таймлайну */
  presetStart?: string | null;
  teamNumber: number;
  saving?: boolean;
  onSubmit: (payload: {
    hall_id: HallId;
    start_time: string;
    end_time: string;
    title: string;
    is_visible_in_schedule: boolean;
  }) => Promise<void> | void;
}

const OPTIONS = timeOptions(15);

const NewBookingDialog = ({
  open,
  onOpenChange,
  bookings,
  hallId,
  date,
  presetStart,
  teamNumber,
  saving = false,
  onSubmit,
}: Props) => {
  const [hall, setHall] = useState<HallId>(hallId);
  const [start, setStart] = useState(presetStart || '14:00');
  const [end, setEnd] = useState(fromMinutes(toMinutes(presetStart || '14:00') + 60));
  const [title, setTitle] = useState('Репетиція');
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHall(hallId);
    const s = presetStart || '14:00';
    setStart(s);
    setEnd(fromMinutes(toMinutes(s) + 60));
    setTitle('Репетиція');
    setVisible(true);
    setError(null);
  }, [open, hallId, presetStart]);

  const handleStart = (v: string) => {
    setStart(v);
    if (toMinutes(end) <= toMinutes(v)) setEnd(fromMinutes(toMinutes(v) + 60));
    setError(null);
  };

  const submit = async () => {
    const rangeError = validateRange(start, end);
    if (rangeError) return setError(rangeError);

    const { available, conflictingBooking } = checkSlotAvailability(
      bookings,
      hall,
      date,
      start,
      end,
    );
    if (!available && conflictingBooking) return setError(conflictMessage(conflictingBooking));

    await onSubmit({
      hall_id: hall,
      start_time: start,
      end_time: end,
      title: title.trim() || 'Репетиція',
      is_visible_in_schedule: visible,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl max-h-[88dvh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" strokeWidth={2} />
            Бронювання зали — команда №{teamNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Зала</Label>
            <Select value={hall} onValueChange={(v) => { setHall(v as HallId); setError(null); }}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HALLS_LIST.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Початок</Label>
              <Select value={start} onValueChange={handleStart}>
                <SelectTrigger className="rounded-xl font-mono tabular-nums">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="font-mono">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Завершення</Label>
              <Select value={end} onValueChange={(v) => { setEnd(v); setError(null); }}>
                <SelectTrigger className="rounded-xl font-mono tabular-nums">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {OPTIONS.filter((t) => toMinutes(t) > toMinutes(start)).map((t) => (
                    <SelectItem key={t} value={t} className="font-mono">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Назва / примітка</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Репетиція"
              maxLength={80}
              className="rounded-xl"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Додати в розклад моєї команди</p>
              <p className="text-[11px] text-muted-foreground">Учасники побачать цю бронь у розкладі</p>
            </div>
            <Switch checked={visible} onCheckedChange={setVisible} />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" strokeWidth={2} />
              <p className="text-xs font-semibold text-destructive">{error}</p>
            </div>
          )}

          <Button onClick={submit} disabled={saving} className="w-full rounded-2xl font-bold">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Забронювати залу
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewBookingDialog;
