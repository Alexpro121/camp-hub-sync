import { useEffect, useMemo, useRef, useState } from 'react';
import { useAllTeams } from '@/hooks/useAllTeams';
import { Card } from '@/components/ui/card';
import { CalendarDays, Users, Clock, Sparkles, Radio, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Schedule, ScheduleItem } from '@/types/app';
import { InlineLoader } from '@/components/ui/loader';
import { sentenceCase } from '@/lib/scheduleCategories';
import {
  minutesSinceDayStart,
  normalizeScheduleItems,
  ongoingEvents,
  shiftISODate,
  dedupeItems,
  SCHEDULE_CHANNEL,
  SCHEDULE_UPDATED,
  type NormalizedScheduleItem,
} from '@/lib/schedule';
import ScheduleCard, { slotsOf } from '@/components/schedule/ScheduleCard';
import { useAutoTodayDate, localISO } from '@/hooks/useAutoTodayDate';
import HallBookingModal from '@/components/schedule/HallBookingModal';
import { hallBadge, hallName, type HallBooking } from '@/types/halls';
import { hhmm, toMinutes } from '@/lib/halls';


interface Props {
  myTeam?: number | null;
  /** Режим для дитини: доступний лише розклад власної команди на сьогодні */
  lockTeam?: boolean;
  /** Режим супроводу: доступні всі дні зміни та фільтр за командами */
  isStaff?: boolean;
  /** Дія переходу на касу/оплату ярмарку */
  onFairAction?: () => void;
}

const todayISO = () => localISO();

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
];

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return { 
    day: String(d.getDate()).padStart(2, '0'), 
    weekday: WEEKDAYS[d.getDay()], 
    month: MONTHS[d.getMonth()] 
  };
};

const countdown = (min: number) => {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  return `${h} год ${String(m % 60).padStart(2, '0')} хв`;
};

const ScheduleView = ({ 
  myTeam = null, 
  lockTeam = false, 
  isStaff = false, 
  onFairAction 
}: Props) => {
  const TEAMS = useAllTeams();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState<number | null>(myTeam ?? null);
  const team = lockTeam ? myTeam ?? null : filterTeam;
  const [now, setNow] = useState(new Date());
  const activeDayRef = useRef<HTMLButtonElement>(null);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [teamBookings, setTeamBookings] = useState<HallBooking[]>([]);


  // Автоматичне перемикання на поточну добу після опівночі
  useAutoTodayDate(activeDay, setActiveDay);

  // Оновлення поточного часу кожні 30 секунд для точного таймлайну
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Завантаження розкладу та Realtime-слухач
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout>;
    
    const load = async () => {
      const { data: sch } = await supabase
        .from('schedules')
        .select('*')
        .eq('is_published', true)
        .order('date', { ascending: true });
      
      const list = (sch || []) as Schedule[];
      setSchedules(list);
      
      const ids = list.map((s) => s.id);
      if (ids.length) {
        const { data: its } = await supabase
          .from('schedule_items')
          .select('*')
          .in('schedule_id', ids)
          .order('order_index');
        setItems((its || []) as unknown as ScheduleItem[]);
      } else {
        setItems([]);
      }
      
      setActiveDay((cur) => (lockTeam ? todayISO() : cur ?? todayISO()));
      setLoading(false);
    };

    load();

    const debounced = () => { 
      clearTimeout(debounce); 
      debounce = setTimeout(load, 600); 
    };

    const ch = supabase
      .channel('schedule-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, debounced)
      .subscribe();

    const live = supabase
      .channel(SCHEDULE_CHANNEL)
      .on('broadcast', { event: SCHEDULE_UPDATED }, debounced)
      .subscribe();

    return () => { 
      clearTimeout(debounce); 
      supabase.removeChannel(ch); 
      supabase.removeChannel(live); 
    };
  }, [lockTeam]);

  // Бронювання залів команди, позначені як видимі в розкладі
  useEffect(() => {
    if (!activeDay) return;
    let cancelled = false;

    const loadBookings = async () => {
      let query = supabase
        .from('hall_bookings')
        .select('*')
        .eq('booking_date', activeDay)
        .eq('is_visible_in_schedule', true);

      if (team != null) query = query.eq('team_number', team);

      const { data } = await query.order('start_time');
      if (!cancelled) setTeamBookings((data || []) as unknown as HallBooking[]);
    };

    loadBookings();

    const ch = supabase
      .channel(`schedule-hall-bookings-${activeDay}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hall_bookings' }, loadBookings)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [activeDay, team]);

  useEffect(() => {
    activeDayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeDay, loading]);


  // Список доступних днів (дітям показується лише сьогоднішній день)
  const days = useMemo(
    () => (lockTeam ? [todayISO()] : [...new Set([...schedules.map((s) => s.date), todayISO()])].sort()),
    [schedules, lockTeam],
  );

  const idsForDate = useMemo(
    () => (d: string | null) => (d ? schedules.filter((s) => s.date === d).map((s) => s.id) : []),
    [schedules],
  );

  const matchesTeam = useMemo(
    () => (i: ScheduleItem) =>
      team == null ||
      !i.target_teams?.length ||
      i.target_teams.includes(team) ||
      slotsOf(i).some((s) => s.teams?.includes(team)),
    [team],
  );

  // Події обраного дня
  const dayEvents = useMemo<NormalizedScheduleItem[]>(() => {
    if (!activeDay) return [];
    const ids = idsForDate(activeDay);
    if (!ids.length) return [];
    return normalizeScheduleItems(
      dedupeItems(items.filter((i) => ids.includes(i.schedule_id))).filter(matchesTeam),
      activeDay,
    );
  }, [items, activeDay, idsForDate, matchesTeam]);

  // Нічні події, що перейшли через північ
  const carryOver = useMemo<NormalizedScheduleItem[]>(() => {
    if (!activeDay) return [];
    const prevDate = shiftISODate(activeDay, -1);
    const ids = idsForDate(prevDate);
    if (!ids.length) return [];
    const prevEvents = normalizeScheduleItems(
      dedupeItems(items.filter((i) => ids.includes(i.schedule_id))).filter(matchesTeam),
      prevDate,
    );
    return ongoingEvents(prevEvents, now).map((e) => ({ ...e, startMin: e.startMin - 1440, endMin: e.endMin - 1440 }));
  }, [items, idsForDate, activeDay, matchesTeam, now]);

  const visibleEvents = useMemo(
    () => [...carryOver, ...dayEvents].sort((a, b) => a.startMin - b.startMin),
    [carryOver, dayEvents],
  );

  const nowRel = activeDay ? minutesSinceDayStart(activeDay, now) : -1;
  const isToday = nowRel >= 0 && nowRel < 1440;

  // Поточна подія просто зараз
  const currentEvent = useMemo(
    () => (isToday ? visibleEvents.find((e) => nowRel >= e.startMin && nowRel < e.endMin) ?? null : null),
    [visibleEvents, nowRel, isToday],
  );

  // Наступна найближча подія
  const nextUp = useMemo(() => {
    if (!isToday) return null;
    const e = visibleEvents.find((x) => x.startMin > nowRel);
    return e ? { event: e, inMin: e.startMin - nowRel } : null;
  }, [visibleEvents, nowRel, isToday]);

  // Репетиції команди у залах як пріоритетні слоти поверх загальної сітки
  type TimelineRow =
    | { kind: 'event'; startMin: number; endMin: number; event: NormalizedScheduleItem }
    | { kind: 'booking'; startMin: number; endMin: number; booking: HallBooking };

  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = visibleEvents.map((e) => ({
      kind: 'event',
      startMin: e.startMin,
      endMin: e.endMin,
      event: e,
    }));

    teamBookings.forEach((b) => {
      rows.push({
        kind: 'booking',
        startMin: toMinutes(b.start_time),
        endMin: toMinutes(b.end_time),
        booking: b,
      });
    });

    return rows.sort((a, b) => a.startMin - b.startMin || (a.kind === 'booking' ? -1 : 1));
  }, [visibleEvents, teamBookings]);

  const bookingButton = isStaff && myTeam != null
    ? (
      <button
        onClick={() => setBookingsOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/[0.07] px-3.5 py-2.5 text-left transition-colors hover:bg-primary/[0.12] active:scale-[0.99]"
      >
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" strokeWidth={2} />
          <span className="text-xs font-bold text-foreground">Бронювання залів</span>
        </span>
        {teamBookings.some((b) => b.team_number === myTeam) && (
          <span className="rounded-full bg-[#FA5A15] px-2 py-0.5 font-mono text-[10px] font-black tabular-nums text-white">
            {teamBookings.filter((b) => b.team_number === myTeam).length}
          </span>
        )}
      </button>
    )
    : null;

  if (loading) return <InlineLoader label="Завантаження розкладу..." />;


  if (!schedules.length && !teamBookings.length) {
    return (
      <div className="space-y-3.5 select-none">
        {bookingButton}
        <Card className="p-8 text-center bg-card/85 backdrop-blur-md border-border/60 rounded-3xl shadow-sm space-y-2 select-none">
          <CalendarDays className="w-10 h-10 text-muted-foreground/40 mx-auto" strokeWidth={1.5} />
          <p className="text-sm font-bold text-foreground">Розклад ще не опубліковано</p>
          <p className="text-xs text-muted-foreground">Супровід готує план активностей на цю зміну</p>
        </Card>
        {isStaff && myTeam != null && (
          <HallBookingModal
            open={bookingsOpen}
            onOpenChange={setBookingsOpen}
            days={days}
            initialDate={activeDay ?? todayISO()}
            myTeam={myTeam}
            shiftId={null}
          />
        )}
      </div>
    );
  }


  const tabCls = 'shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold transition-all duration-300 active:scale-95 select-none';

  return (
    <div className="space-y-3.5 select-none">

      {bookingButton}

      {/* 1. ВИБІР ДНЯ (ДЛЯ СУПРОВОДУ) */}

      {days.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 overscroll-contain">
          {days.map((d) => {
            const p = dayParts(d);
            const active = d === activeDay;
            return (
              <button
                key={d}
                ref={active ? activeDayRef : undefined}
                onClick={() => setActiveDay(d)}
                className={`${tabCls} flex flex-col items-center leading-tight border ${
                  active
                    ? 'bg-[#FA5A15] text-white border-[#FA5A15] shadow-[0_0_16px_rgba(250,90,21,0.35)] scale-[1.02]'
                    : 'border-border/50 bg-card/80 hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-[9px] uppercase tracking-wider font-bold opacity-80">{p.weekday}</span>
                <span className="font-mono text-base font-black tabular-nums my-0.5">{p.day}</span>
                <span className="text-[9px] font-medium opacity-80">{p.month}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2. ФІЛЬТР ЗА КОМАНДАМИ */}
      {lockTeam ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-card/80 backdrop-blur-md px-3.5 py-2.5 shadow-sm">
          <Users className="h-4 w-4 text-primary shrink-0" strokeWidth={2} />
          <p className="text-xs font-semibold text-foreground">
            Розклад твоєї команди{myTeam != null ? ` №${myTeam}` : ''}
          </p>
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 overscroll-contain">
          <button
            onClick={() => setFilterTeam(null)}
            className={`${tabCls} ${
              filterTeam === null 
                ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20' 
                : 'border border-border/50 bg-card/80 text-muted-foreground hover:text-foreground'
            }`}
          >
            Всі команди
          </button>

          {myTeam != null && (
            <button
              onClick={() => setFilterTeam(myTeam)}
              className={`${tabCls} ${
                filterTeam === myTeam 
                  ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20' 
                  : 'border border-border/50 bg-card/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              Моя команда (№{myTeam})
            </button>
          )}

          {TEAMS.filter((t) => t !== myTeam).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTeam(filterTeam === t ? null : t)}
              className={`${tabCls} font-mono font-bold tabular-nums ${
                filterTeam === t 
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' 
                  : 'border border-border/50 bg-card/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              К#{t}
            </button>
          ))}
        </div>
      )}

      {/* 3. КАРТКА «ДАЛІ ЗА РОЗКЛАДОМ» */}
      {nextUp && (
        <Card className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/[0.08] via-card/85 to-card/85 p-4 sm:p-4.5 shadow-md backdrop-blur-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Далі за розкладом
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">через {countdown(nextUp.inMin)}</span>
          </div>

          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="min-w-0 pr-2">
              <p className="truncate text-base sm:text-lg font-bold tracking-tight text-foreground">
                {sentenceCase(nextUp.event.title)}
              </p>
              <p className="font-mono text-xs font-semibold tabular-nums text-muted-foreground mt-0.5">
                {nextUp.event.timeStart} – {nextUp.event.timeEnd}
              </p>
            </div>

            <p className="shrink-0 font-mono text-2xl sm:text-3xl font-black tabular-nums leading-none text-primary">
              {countdown(nextUp.inMin)}
            </p>
          </div>
        </Card>
      )}

      {/* Пустий стан дня */}
      {visibleEvents.length === 0 && (
        <Card className="p-8 text-center bg-card/85 backdrop-blur-md border-border/60 rounded-3xl space-y-2">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
          <p className="text-sm font-bold text-foreground">
            {idsForDate(activeDay).length
              ? 'Подій на цей день немає'
              : 'Розклад на цей день готується супроводом табору'}
          </p>
        </Card>
      )}

      {/* 4. ХРОНОЛОГІЧНИЙ СПИСОК КАРТОК РОЗКЛАДУ + РЕПЕТИЦІЇ КОМАНДИ */}
      <div className="space-y-2.5">
        {timelineRows.map((row) => {
          if (row.kind === 'booking') {
            const b = row.booking;
            const active = isToday && nowRel >= row.startMin && nowRel < row.endMin;
            return (
              <Card
                key={`b-${b.id}`}
                className={`rounded-3xl border p-4 backdrop-blur-xl transition-all ${
                  active
                    ? 'border-[#FA5A15]/50 bg-[#FA5A15]/[0.08] shadow-[0_0_20px_rgba(250,90,21,0.18)]'
                    : 'border-primary/25 bg-card/80'
                } ${isToday && nowRel >= row.endMin ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FA5A15]/30 bg-[#FA5A15]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FA5A15]">
                    <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                    Репетиція команди
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
                    {hhmm(b.start_time)} – {hhmm(b.end_time)}
                  </span>
                </div>

                <p className="text-base font-bold tracking-tight text-foreground">
                  {sentenceCase(b.title || 'Репетиція')}
                </p>

                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${hallBadge(b.hall_id)}`}>
                    <Building2 className="h-3 w-3" strokeWidth={2.5} />
                    {hallName(b.hall_id)}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                    Команда №{b.team_number}
                  </span>
                </div>
              </Card>
            );
          }

          const e = row.event;
          const isNow = currentEvent?.id === e.id;
          return (
            <ScheduleCard
              key={e.id}
              event={e}
              team={team}
              isNow={isNow}
              past={isToday && nowRel >= e.endMin}
              progress={isNow ? ((nowRel - e.startMin) / Math.max(1, e.endMin - e.startMin)) * 100 : 0}
              isStaff={isStaff}
              onFairAction={onFairAction}
            />
          );
        })}
      </div>

      {isStaff && myTeam != null && activeDay && (
        <HallBookingModal
          open={bookingsOpen}
          onOpenChange={setBookingsOpen}
          days={days}
          initialDate={activeDay}
          myTeam={myTeam}
          shiftId={schedules.find((s) => s.date === activeDay)?.shift_id ?? null}
        />
      )}

    </div>

  );
};

export default ScheduleView;
