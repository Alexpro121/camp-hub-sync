import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Building2, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Дні зміни для вибору дати */
  days: string[];
  initialDate: string;
  myTeam: number;
  shiftId?: string | null;
}

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return { day: String(d.getDate()).padStart(2, '0'), weekday: WEEKDAYS[d.getDay()] };
};

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

  useEffect(() => {
    if (open) setDate(initialDate);
  }, [open, initialDate]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('hall_bookings')
      .select('*')
      .eq('booking_date', date)
      .order('start_time');

    if (error) {
      toast({ title: 'Не вдалося завантажити бронювання', variant: 'destructive' });
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

    return () => { supabase.removeChannel(ch); };
  }, [open, date, load]);

  const hallBookings = useMemo(
    () => bookings.filter((b) => b.hall_id === hall).sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [bookings, hall],
  );

  const busyCountByHall = useMemo(() => {
    const map = new Map<string, number>();
    bookings.forEach((b) => map.set(b.hall_id, (map.get(b.hall_id) ?? 0) + 1));
    return map;
  }, [bookings]);

  const bookingAt = (min: number) =>
    hallBookings.find((b) => toMinutes(b.start_time) <= min && toMinutes(b.end_time) > min) ?? null;

  const create = async (payload: {
    hall_id: HallId;
    start_time: string;
    end_time: string;
    title: string;
    is_visible_in_schedule: boolean;
  }) => {
    setSaving(true);
    const { error } = await supabase.from('hall_bookings').insert({
      ...payload,
      booking_date: date,
      team_number: myTeam,
      shift_id: shiftId ?? null,
    });
    setSaving(false);

    if (error) {
      toast({ title: 'Не вдалося забронювати', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Залу заброньовано', description: `${hallName(payload.hall_id)} · ${payload.start_time}–${payload.end_time}` });
    setFormOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('hall_bookings').delete().eq('id', id);
    if (error) {
      toast({ title: 'Не вдалося скасувати', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Бронь скасовано' });
    load();
  };

  const toggleVisible = async (b: HallBooking) => {
    const { error } = await supabase
      .from('hall_bookings')
      .update({ is_visible_in_schedule: !b.is_visible_in_schedule })
      .eq('id', b.id);
    if (error) {
      toast({ title: 'Не вдалося змінити видимість', description: error.message, variant: 'destructive' });
      return;
    }
    load();
  };

  const openForm = (startMin?: number) => {
    setPresetStart(startMin != null ? fromMinutes(startMin) : null);
    setFormOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl rounded-3xl max-h-[90dvh] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" strokeWidth={2} />
              Бронювання залів
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5">
            {/* Дні */}
            <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 overscroll-contain">
              {days.map((d) => {
                const p = dayLabel(d);
                const active = d === date;
                return (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`shrink-0 rounded-2xl border px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 flex flex-col items-center leading-tight ${
                      active
                        ? 'bg-[#FA5A15] text-white border-[#FA5A15] shadow-[0_0_16px_rgba(250,90,21,0.35)]'
                        : 'border-border/50 bg-card/80 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-[9px] uppercase tracking-wider font-bold opacity-80">{p.weekday}</span>
                    <span className="font-mono text-base font-black tabular-nums">{p.day}</span>
                  </button>
                );
              })}
            </div>

            {/* Зали */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 overscroll-contain">
              {HALLS_LIST.map((h) => {
                const active = h.id === hall;
                const busy = busyCountByHall.get(h.id) ?? 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => setHall(h.id)}
                    className={`shrink-0 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 border ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                        : 'border-border/50 bg-card/80 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {h.name}
                    {busy > 0 && (
                      <span className={`ml-1.5 font-mono tabular-nums ${active ? 'opacity-80' : 'text-primary'}`}>
                        {busy}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <InlineLoader label="Завантаження бронювань..." />
            ) : (
              <>
                {/* Таймлайн зали */}
                <div className="rounded-3xl border border-border/60 bg-card/70 p-2.5 space-y-1">
                  {HOURS.map((h) => {
                    const b = bookingAt(h);
                    const mine = b?.team_number === myTeam;
                    return (
                      <div key={h} className="flex items-stretch gap-2">
                        <span className="w-12 shrink-0 pt-2 font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
                          {fromMinutes(h)}
                        </span>
                        {b ? (
                          <div
                            className={`flex-1 rounded-2xl border px-3 py-2 ${
                              mine
                                ? 'border-[#FA5A15]/40 bg-[#FA5A15]/10'
                                : 'border-destructive/30 bg-destructive/10'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className={`truncate text-xs font-bold ${mine ? 'text-[#FA5A15]' : 'text-destructive'}`}>
                                  Команда №{b.team_number}
                                  <span className="ml-1.5 font-mono font-semibold tabular-nums opacity-80">
                                    {hhmm(b.start_time)}–{hhmm(b.end_time)}
                                  </span>
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">{b.title}</p>
                              </div>
                              {mine && (
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <button
                                    onClick={() => toggleVisible(b)}
                                    title="Показувати в розкладі команди"
                                    className="rounded-xl border border-border/50 bg-card/80 p-1.5 text-muted-foreground hover:text-foreground active:scale-95"
                                  >
                                    {b.is_visible_in_schedule
                                      ? <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                                      : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />}
                                  </button>
                                  <button
                                    onClick={() => remove(b.id)}
                                    title="Скасувати бронь"
                                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-1.5 text-destructive active:scale-95"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openForm(h)}
                            className="flex-1 rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-left text-[11px] font-semibold text-emerald-500/90 transition-colors hover:bg-emerald-500/10 active:scale-[0.99]"
                          >
                            Вільно — забронювати
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button onClick={() => openForm()} className="w-full rounded-2xl font-bold">
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} />
                  Нове бронювання
                </Button>

                {/* Мої броні на цю дату */}
                {bookings.some((b) => b.team_number === myTeam) && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Броні моєї команди
                    </p>
                    {bookings
                      .filter((b) => b.team_number === myTeam)
                      .map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/70 px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-foreground">
                              {hallName(b.hall_id)} · {b.title}
                            </p>
                            <p className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {hhmm(b.start_time)}–{hhmm(b.end_time)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Switch
                              checked={b.is_visible_in_schedule}
                              onCheckedChange={() => toggleVisible(b)}
                            />
                            <button
                              onClick={() => remove(b.id)}
                              className="rounded-xl border border-destructive/30 bg-destructive/10 p-1.5 text-destructive active:scale-95"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
