import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Building2, 
  Eye, 
  EyeOff, 
  Plus, 
  Trash2, 
  Clock, 
  Calendar as CalendarIcon,
  Sparkles,
  Layers
} from 'lucide-react';
import { InlineLoader } from '@/components/ui/loader';
import { HALLS_LIST, hallName, type HallBooking, type HallId } from '@/types/halls';
import {
  TIMELINE_END,
  TIMELINE_START,
  hhmm,
  toMinutes,
  fromMinutes,
} from '@/lib/halls';
import NewBookingDialog from '@/components/schedule/NewBookingDialog';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  days: string[];
  initialDate: string;
  myTeam: number;
  shiftId?: string | null;
}

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'груд'];

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return { 
    day: String(d.getDate()).padStart(2, '0'), 
    weekday: WEEKDAYS[d.getDay()],
    month: MONTHS[d.getMonth()]
  };
};

// Висота 1 години на таймлайні в пікселях
const HOUR_HEIGHT = 64; 

const HOURS = Array.from(
  { length: (TIMELINE_END - TIMELINE_START) / 60 },
  (_, i) => TIMELINE_START + i * 60,
);

const HallBookingModal = ({ open, onOpenChange, days, initialDate, myTeam, shiftId }: Props) => {
  const [date, setDate] = useState(initialDate);
  const [hall, setHall] = useState<HallId>('hall_ab');
  const [bookings, setBookings] = useState<HallBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [presetStart, setPresetStart] = useState<string | null>(null);
  
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const haptics = useHaptics();
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Оновлення поточної хвилини для червоної лінії Google Calendar
  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) setDate(initialDate);
  }, [open, initialDate]);

  // Завантаження бронювань з бази
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('hall_bookings')
      .select('*')
      .eq('booking_date', date)
      .order('start_time');

    if (error) {
      toast.error('Не вдалося завантажити бронювання');
      setLoading(false);
      return;
    }
    setBookings((data || []) as unknown as HallBooking[]);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load();

    const ch = supabase
      .channel(`hall-bookings-${date}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hall_bookings' }, () => load())
      .subscribe();

    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [open, date, load]);

  // Бронювання обраної зали
  const hallBookings = useMemo(
    () => bookings.filter((b) => b.hall_id === hall).sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [bookings, hall],
  );

  // Лічильник зайнятості по кожній залі
  const busyCountByHall = useMemo(() => {
    const map = new Map<string, number>();
    bookings.forEach((b) => map.set(b.hall_id, (map.get(b.hall_id) ?? 0) + 1));
    return map;
  }, [bookings]);

  // Створення нового бронювання
  const create = async (payload: {
    hall_id: HallId;
    start_time: string;
    end_time: string;
    title: string;
    is_visible_in_schedule: boolean;
  }) => {
    setSaving(true);
    haptics.impact('medium');

    const { error } = await supabase.from('hall_bookings').insert({
      ...payload,
      booking_date: date,
      team_number: myTeam,
      shift_id: shiftId ?? null,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message || 'Не вдалося забронювати');
      return;
    }
    
    toast.success(`Залу заброньовано: ${hallName(payload.hall_id)} (${payload.start_time}–${payload.end_time})`);
    setFormOpen(false);
    load();
  };

  // Скасування броні
  const remove = async (id: string) => {
    haptics.impact('light');
    const { error } = await supabase.from('hall_bookings').delete().eq('id', id);
    if (error) {
      toast.error('Не вдалося скасувати бронь');
      return;
    }
    toast.success('Бронь скасовано');
    load();
  };

  // Зміна видимості в розкладі команди
  const toggleVisible = async (b: HallBooking) => {
    haptics.impact('light');
    const nextVal = !b.is_visible_in_schedule;
    
    // Оптимістичне оновлення
    setBookings(prev => prev.map(item => item.id === b.id ? { ...item, is_visible_in_schedule: nextVal } : item));

    const { error } = await supabase
      .from('hall_bookings')
      .update({ is_visible_in_schedule: nextVal })
      .eq('id', b.id);
    
    if (error) {
      toast.error('Не вдалося змінити видимість');
      load();
    } else {
      toast.success(nextVal ? 'Додано в розклад команди' : 'Приховано з розкладу команди');
    }
  };

  const openForm = (startMin?: number) => {
    haptics.impact('light');
    setPresetStart(startMin != null ? fromMinutes(startMin) : null);
    setFormOpen(true);
  };

  // Перевірка чи вибрана дата є сьогоднішньою
  const isToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return date === today;
  }, [date]);

  // Загальна висота таймлайн-сітки
  const totalTimelineHeight = (TIMELINE_END - TIMELINE_START) * (HOUR_HEIGHT / 60);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden rounded-[28px] sm:rounded-3xl max-h-[92dvh] bg-card/95 backdrop-blur-2xl border-border/60 shadow-2xl flex flex-col select-none">
          
          {/* ================= 1. ШАПКА ДІАЛОГУ ================= */}
          <DialogHeader className="p-4 sm:p-5 border-b border-border/40 pb-3 bg-card/80 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-foreground">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
                  <Building2 className="h-4 w-4" strokeWidth={2} />
                </div>
                <span>Бронювання залів для репетицій</span>
              </DialogTitle>

              <span className="text-[11px] font-mono font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                Команда №{myTeam}
              </span>
            </div>
          </DialogHeader>

          {/* ================= 2. ЛИПКІ ФІЛЬТРИ: ДНІ ТА ЗАЛИ ================= */}
          <div className="p-3 sm:p-4 space-y-2.5 border-b border-border/40 bg-surface-1/40 backdrop-blur-md shrink-0">
            
            {/* Вибір дня */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 overscroll-contain">
              {days.map((d) => {
                const p = dayLabel(d);
                const active = d === date;
                return (
                  <button
                    key={d}
                    onClick={() => { haptics.impact('light'); setDate(d); }}
                    className={`shrink-0 rounded-2xl border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95 flex items-center gap-2 ${
                      active
                        ? 'bg-[#FA5A15] text-white border-[#FA5A15] shadow-[0_0_14px_rgba(250,90,21,0.35)] scale-[1.02]'
                        : 'border-border/50 bg-card/70 hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-mono font-bold opacity-80">{p.weekday}</span>
                    <span className="font-mono text-sm font-black tabular-nums">{p.day}</span>
                    <span className="text-[10px] font-medium opacity-80">{p.month}</span>
                  </button>
                );
              })}
            </div>

            {/* Вибір зали */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 overscroll-contain">
              {HALLS_LIST.map((h) => {
                const active = h.id === hall;
                const busy = busyCountByHall.get(h.id) ?? 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => { haptics.impact('light'); setHall(h.id); }}
                    className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 border flex items-center gap-1.5 ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'border-border/50 bg-card/70 hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span>{h.name}</span>
                    {busy > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        active ? 'bg-black/20 text-white' : 'bg-primary/15 text-primary'
                      }`}>
                        {busy}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

          </div>

          {/* ================= 3. ТАЙМЛАЙН У СТИЛІ GOOGLE CALENDAR ================= */}
          <div ref={timelineScrollRef} className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 relative custom-scrollbar">
            {loading ? (
              <div className="py-12 flex justify-center">
                <InlineLoader label="Завантаження таймлайну зали..." />
              </div>
            ) : (
              <div className="relative flex">
                
                {/* Ліва вісь годин (08:00 - 23:00) */}
                <div className="w-11 sm:w-14 shrink-0 relative select-none" style={{ height: `${totalTimelineHeight}px` }}>
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 text-[10px] sm:text-[11px] font-mono font-bold text-muted-foreground/80 tabular-nums -translate-y-2"
                      style={{ top: `${((h - TIMELINE_START) / 60) * HOUR_HEIGHT}px` }}
                    >
                      {fromMinutes(h)}
                    </div>
                  ))}
                </div>

                {/* Права сітка розкладу з горизонтальними лініями */}
                <div 
                  className="relative flex-1 rounded-2xl border border-border/40 bg-surface-1/20 overflow-hidden ml-1"
                  style={{ height: `${totalTimelineHeight}px` }}
                  onClick={(e) => {
                    // Клік по вільній області сітки вираховує час початку
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickY = e.clientY - rect.top;
                    const clickedMinute = TIMELINE_START + Math.floor(clickY / (HOUR_HEIGHT / 60));
                    // Округлюємо до 30 хв
                    const roundedMin = Math.floor(clickedMinute / 30) * 30;
                    openForm(roundedMin);
                  }}
                >
                  {/* Горизонтальні розділювачі годин */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-border/25 pointer-events-none"
                      style={{ top: `${((h - TIMELINE_START) / 60) * HOUR_HEIGHT}px` }}
                    >
                      {/* Лінія півгодини (пунктир) */}
                      <div className="w-full border-t border-dashed border-border/10 mt-[32px]" />
                    </div>
                  ))}

                  {/* Червона лінія поточного часу (Google Calendar Live Indicator) */}
                  {isToday && nowMinutes >= TIMELINE_START && nowMinutes <= TIMELINE_END && (
                    <div
                      className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                      style={{ top: `${((nowMinutes - TIMELINE_START) / 60) * HOUR_HEIGHT}px` }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] -ml-1" />
                      <div className="flex-1 border-t-2 border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                    </div>
                  )}

                  {/* Блоки заброньованих виступів / репетицій */}
                  {hallBookings.map((b) => {
                    const startMin = toMinutes(b.start_time);
                    const endMin = toMinutes(b.end_time);
                    const durationMin = Math.max(15, endMin - startMin);
                    
                    const topPx = ((startMin - TIMELINE_START) / 60) * HOUR_HEIGHT;
                    const heightPx = Math.max(38, (durationMin / 60) * HOUR_HEIGHT - 2);
                    const isMine = b.team_number === myTeam;

                    return (
                      <div
                        key={b.id}
                        onClick={(e) => e.stopPropagation()} // Запобігаємо кліку по сітці
                        className={`absolute inset-x-1.5 z-10 rounded-xl p-2 sm:p-2.5 border backdrop-blur-md shadow-md transition-all flex flex-col justify-between overflow-hidden ${
                          isMine
                            ? 'bg-gradient-to-r from-[#FA5A15]/20 via-[#FA5A15]/15 to-card/90 border-[#FA5A15]/50 text-foreground'
                            : 'bg-muted/70 border-border/60 text-foreground'
                        }`}
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                        }}
                      >
                        {/* Верхній рядок: Команда та час */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                              isMine ? 'bg-[#FA5A15] text-white' : 'bg-muted text-foreground'
                            }`}>
                              К#{b.team_number}
                            </span>
                            <p className="text-xs font-bold truncate">
                              {b.title || 'Репетиція'}
                            </p>
                          </div>

                          <span className="font-mono text-[10px] font-bold tabular-nums shrink-0 opacity-80">
                            {hhmm(b.start_time)}–{hhmm(b.end_time)}
                          </span>
                        </div>

                        {/* Нижні кнопки керування (лише для своєї команди) */}
                        {isMine && heightPx >= 50 && (
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#FA5A15]/20 mt-1">
                            <button
                              type="button"
                              onClick={() => toggleVisible(b)}
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                            >
                              {b.is_visible_in_schedule ? (
                                <>
                                  <Eye className="w-3 h-3 text-[#FA5A15]" />
                                  <span className="text-[#FA5A15]">У розкладі</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Приховано</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => remove(b.id)}
                              className="p-1 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive active:scale-90 transition-all"
                              title="Скасувати бронь"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            )}
          </div>

          {/* ================= 4. НИЖНЯ ПАНЕЛЬ ДІЙ ================= */}
          <div className="p-3 sm:p-4 border-t border-border/40 bg-card/85 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-muted-foreground hidden sm:block">
              Підказка: натисніть на вільний проміжок сітки для швидкого вибору
            </div>

            <Button
              onClick={() => openForm()}
              className="w-full sm:w-auto ml-auto h-11 px-5 rounded-2xl font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Забронювати час</span>
            </Button>
          </div>

        </DialogContent>
      </Dialog>

      {/* Діалог створення нового запису */}
      <NewBookingDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        bookings={bookings}
        hallId={hall}
        date={date}
        presetStart={presetStart}
        teamNumber={myTeam}
        saving={saving}
        onSubmit={create}
      />
    </>
  );
};

export default HallBookingModal;
