import { useEffect, useMemo, useRef, useState } from 'react';
import { useAllTeams } from '@/hooks/useAllTeams';
import { Card } from '@/components/ui/card';
import { CalendarDays, Users } from 'lucide-react';
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

interface Props {
  myTeam?: number | null;
  /** Child mode: only the own team's schedule is visible. */
  lockTeam?: boolean;
  /** Staff view flag — switches the live fair CTA to the cash register. */
  isStaff?: boolean;
  /** Opens the fair register (staff) or the QR scanner (child). */
  onFairAction?: () => void;
}

const todayISO = () => localISO();

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return { day: String(d.getDate()).padStart(2, '0'), weekday: WEEKDAYS[d.getDay()], month: MONTHS[d.getMonth()] };
};

const countdown = (min: number) => {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  return `${h} год ${String(m % 60).padStart(2, '0')} хв`;
};

const ScheduleView = ({ myTeam = null, lockTeam = false, isStaff = false, onFairAction }: Props) => {
  const TEAMS = useAllTeams();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState<number | null>(myTeam ?? null);
  const team = lockTeam ? myTeam ?? null : filterTeam;
  const [now, setNow] = useState(new Date());
  const activeDayRef = useRef<HTMLButtonElement>(null);

  // Live midnight rollover: yesterday's tab jumps to today automatically.
  useAutoTodayDate(activeDay, setActiveDay);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

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
    const debounced = () => { clearTimeout(debounce); debounce = setTimeout(load, 600); };
    const ch = supabase
      .channel('schedule-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, debounced)
      .subscribe();
    const live = supabase
      .channel(SCHEDULE_CHANNEL)
      .on('broadcast', { event: SCHEDULE_UPDATED }, debounced)
      .subscribe();
    return () => { clearTimeout(debounce); supabase.removeChannel(ch); supabase.removeChannel(live); };
  }, []);

  useEffect(() => {
    activeDayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeDay, loading]);

  /** One tab per date — several schedule batches of the same day are merged.
   *  Children never see future days: no spoilers for tomorrow. */
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

  /** Events of the selected day, with ISO start/end (auto +1 day past midnight). */
  const dayEvents = useMemo<NormalizedScheduleItem[]>(() => {
    if (!activeDay) return [];
    const ids = idsForDate(activeDay);
    if (!ids.length) return [];
    return normalizeScheduleItems(
      dedupeItems(items.filter((i) => ids.includes(i.schedule_id))).filter(matchesTeam),
      activeDay,
    );
  }, [items, activeDay, idsForDate, matchesTeam]);

  /** Previous night's events that are still running right now (cross-midnight). */
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

  /** Minutes since 00:00 of the selected day (can be < 0 or > 1440 for other days). */
  const nowRel = activeDay ? minutesSinceDayStart(activeDay, now) : -1;
  const isToday = nowRel >= 0 && nowRel < 1440;

  const currentEvent = useMemo(
    () => (isToday ? visibleEvents.find((e) => nowRel >= e.startMin && nowRel < e.endMin) ?? null : null),
    [visibleEvents, nowRel, isToday],
  );

  const nextUp = useMemo(() => {
    if (!isToday) return null;
    const e = visibleEvents.find((x) => x.startMin > nowRel);
    return e ? { event: e, inMin: e.startMin - nowRel } : null;
  }, [visibleEvents, nowRel, isToday]);

  if (loading) return <InlineLoader label="Завантаження розкладу" />;

  if (!schedules.length) {
    return (
      <Card className="p-8 text-center bg-gradient-card">
        <CalendarDays className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Розклад ще не опубліковано</p>
      </Card>
    );
  }

  const tabCls = 'shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95';

  return (
    <div className="space-y-3">
      {/* Days — a child only ever gets today */}
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {days.map((d) => {
          const p = dayParts(d);
          const active = d === activeDay;
          return (
            <button
              key={d}
              ref={active ? activeDayRef : undefined}
              onClick={() => setActiveDay(d)}
              className={`${tabCls} flex flex-col items-center leading-tight ${
                active
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20'
                  : 'border border-white/10 bg-slate-900/70 text-slate-300'
              }`}
            >
              <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">{p.weekday}</span>
              <span className="font-mono text-sm font-bold tabular-nums">{p.day}</span>
              <span className="text-[9px] opacity-70">{p.month}</span>
            </button>
          );
        })}
      </div>

      {/* Team filter */}
      {lockTeam ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
          <Users className="h-3.5 w-3.5 text-amber-400" strokeWidth={1.75} />
          <p className="text-[11px] font-medium text-slate-300">
            Розклад твоєї команди{myTeam != null ? ` №${myTeam}` : ''}
          </p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
          <button
            onClick={() => setFilterTeam(null)}
            className={`${tabCls} ${filterTeam === null ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20' : 'border border-white/10 bg-slate-900/70 text-slate-300'}`}
          >Всі команди</button>
          {myTeam != null && (
            <button
              onClick={() => setFilterTeam(myTeam)}
              className={`${tabCls} ${filterTeam === myTeam ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20' : 'border border-white/10 bg-slate-900/70 text-slate-300'}`}
            >Моя команда (К{myTeam})</button>
          )}
          {TEAMS.filter((t) => t !== myTeam).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTeam(filterTeam === t ? null : t)}
              className={`${tabCls} font-mono tabular-nums ${filterTeam === t ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20' : 'border border-white/10 bg-slate-900/70 text-slate-300'}`}
            >{t}</button>
          ))}
        </div>
      )}

      {/* Next up */}
      {nextUp && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-xl backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Далі за розкладом</p>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-tight text-white">{sentenceCase(nextUp.event.title)}</p>
              <p className="font-mono text-xs font-medium tabular-nums text-slate-400">
                {nextUp.event.timeStart} – {nextUp.event.timeEnd}
              </p>
            </div>
            <p className="shrink-0 font-mono text-2xl font-bold tabular-nums leading-none text-amber-400">
              {countdown(nextUp.inMin)}
            </p>
          </div>
        </div>
      )}

      {visibleEvents.length === 0 && (
        <Card className="p-6 text-center bg-card/50">
          <CalendarDays className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {idsForDate(activeDay).length
              ? 'Подій на цей день немає'
              : 'Розклад на цей день готується оргкомітетом табору'}
          </p>
        </Card>
      )}

      {/* Chronological timeline */}
      <div className="space-y-2.5">
        {visibleEvents.map((e) => {
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
    </div>
  );
};

export default ScheduleView;
