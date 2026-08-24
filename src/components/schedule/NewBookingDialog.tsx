import { useEffect, useState, useMemo } from 'react';
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
import { 
  AlertTriangle, 
  Building2, 
  Loader2, 
  Clock, 
  CheckCircle2, 
  Sparkles,
  CalendarDays
} from 'lucide-react';
import { HALLS_LIST, type HallBooking, type HallId } from '@/types/halls';
import {
  checkSlotAvailability,
  conflictMessage,
  fromMinutes,
  timeOptions,
  toMinutes,
  validateRange,
} from '@/lib/halls';
import { useHaptics } from '@/hooks/useHaptics';

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
const DURATION_PRESETS = [30, 45, 60, 90, 120];

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

  const haptics = useHaptics();

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

  // Розрахунок поточної тривалості в хвилинах
  const durationMinutes = useMemo(() => {
    const diff = toMinutes(end) - toMinutes(start);
    return Math.max(0, diff);
  }, [start, end]);

  const formatDuration = (min: number) => {
    if (min < 60) return `${min} хв`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h} год ${m} хв` : `${h} год`;
  };

  // Зміна часу початку з авто-коригуванням завершення
  const handleStart = (v: string) => {
    haptics.selection();
    setStart(v);
    if (toMinutes(end) <= toMinutes(v)) {
      setEnd(fromMinutes(toMinutes(v) + 60));
    }
    setError(null);
  };

  // Швидке встановлення тривалості кнопками-пресетами
  const handleSetDuration = (mins: number) => {
    haptics.impact('light');
    const newEnd = fromMinutes(toMinutes(start) + mins);
    setEnd(newEnd);
    setError(null);
  };

  // Перевірка зайнятості слоту в реальному часі
  const availabilityCheck = useMemo(() => {
    if (!open) return { available: true };
    if (toMinutes(end) <= toMinutes(start)) {
      return { available: false, error: 'Час завершення має бути пізнішим за початок' };
    }
    const res = checkSlotAvailability(bookings, hall, date, start, end);
    if (!res.available && res.conflictingBooking) {
      return { available: false, error: conflictMessage(res.conflictingBooking) };
    }
    return { available: true };
  }, [open, bookings, hall, date, start, end]);

  const submit = async () => {
    const rangeError = validateRange(start, end);
    if (rangeError) {
      haptics.notification('error');
      return setError(rangeError);
    }

    if (!availabilityCheck.available) {
      haptics.notification('error');
      return setError(availabilityCheck.error || 'Слот зайнятий');
    }

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
      <DialogContent className="max-w-md w-full p-5 sm:p-6 rounded-[28px] sm:rounded-3xl max-h-[90dvh] overflow-y-auto overscroll-contain bg-card/95 backdrop-blur-2xl border-border/60 shadow-2xl select-none">
        
        {/* Шапка діалогу */}
        <DialogHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-foreground">
              <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
                <Building2 className="h-4 w-4" strokeWidth={2} />
              </div>
              <span>Бронювання зали</span>
            </DialogTitle>

            <span className="text-[11px] font-mono font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
              Команда №{teamNumber}
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          
          {/* 1. ВИБІР ЗАЛИ */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              Оберіть локацію
            </Label>
            <Select value={hall} onValueChange={(v) => { haptics.selection(); setHall(v as HallId); setError(null); }}>
              <SelectTrigger className="h-11 rounded-xl bg-surface-1/50 border-border/60 text-xs sm:text-sm font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl bg-card border-border/60">
                {HALLS_LIST.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs sm:text-sm font-medium">
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. ЧАС ПОЧАТКУ ТА ЗАВЕРШЕННЯ */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>Початок</span>
                </Label>
                <Select value={start} onValueChange={handleStart}>
                  <SelectTrigger className="h-11 rounded-xl bg-surface-1/50 border-border/60 font-mono text-xs sm:text-sm font-bold tabular-nums">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-56 rounded-xl bg-card border-border/60">
                    {OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="font-mono text-xs sm:text-sm">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Завершення</span>
                </Label>
                <Select value={end} onValueChange={(v) => { haptics.selection(); setEnd(v); setError(null); }}>
                  <SelectTrigger className="h-11 rounded-xl bg-surface-1/50 border-border/60 font-mono text-xs sm:text-sm font-bold tabular-nums">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-56 rounded-xl bg-card border-border/60">
                    {OPTIONS.filter((t) => toMinutes(t) > toMinutes(start)).map((t) => (
                      <SelectItem key={t} value={t} className="font-mono text-xs sm:text-sm">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Швидкі кнопки тривалості (Пресет-чіпси) */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                <span className="uppercase font-bold tracking-wider">Швидка тривалість:</span>
                <span className="font-mono font-semibold text-foreground">Разом: {formatDuration(durationMinutes)}</span>
              </div>
              
              <div className="grid grid-cols-5 gap-1">
                {DURATION_PRESETS.map((m) => {
                  const isCurrent = durationMinutes === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSetDuration(m)}
                      className={`h-8 rounded-lg text-[11px] font-mono font-bold transition-all active:scale-95 border ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-surface-1/60 hover:bg-muted/60 border-border/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {m < 60 ? `${m}хв` : `${m / 60}г`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. НАЗВА ТА ПРИМІТКА */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              Назва виступу або примітка
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Наприклад: Генеральна репетиція танцю..."
              maxLength={80}
              className="h-11 rounded-xl bg-surface-1/50 border-border/60 text-xs sm:text-sm"
            />
          </div>

          {/* 4. ТУМБЛЕР ВИДИМОСТІ В РОЗКЛАДІ КОМАНДИ */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface-1/40 p-3.5 shadow-sm">
            <div className="min-w-0 pr-1">
              <p className="text-xs font-bold text-foreground">Додати в розклад моєї команди</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Учасники побачать цю репетицію у своєму плані дня
              </p>
            </div>
            <Switch 
              checked={visible} 
              onCheckedChange={(val) => { haptics.selection(); setVisible(val); }} 
            />
          </div>

          {/* 5. ЖИВИЙ ІНДИКАТОР ВІЛЬНОСТІ СЛОТУ */}
          {availabilityCheck.available ? (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Час вільний для бронювання</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold animate-fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-snug">{error || availabilityCheck.error}</p>
            </div>
          )}

          {/* 6. КНОПКА ПІДТВЕРДЖЕННЯ */}
          <Button 
            onClick={submit} 
            disabled={saving || !availabilityCheck.available} 
            className="w-full h-12 rounded-2xl text-xs sm:text-sm font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-all shadow-md mt-1"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4 fill-current" />
            )}
            <span>Підтвердити бронювання</span>
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewBookingDialog;
