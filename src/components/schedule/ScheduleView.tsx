import { useEffect, useMemo, useRef, useState } from 'react';
import { useAllTeams } from '@/hooks/useAllTeams';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Schedule, ScheduleItem, ScheduleSubSlot } from '@/types/app';
import { InlineLoader } from '@/components/ui/loader';
import { catMeta, fromMinutes, sentenceCase, toMinutes } from '@/lib/scheduleCategories';
import {
  minutesSinceDayStart,
  normalizeScheduleItems,
  ongoingEvents,
  shiftISODate,
  type NormalizedScheduleItem,
} from '@/lib/schedule';
import { type ReminderEvent } from '@/hooks/useEventReminders';

interface Props {
  myTeam?: number | null;
  /** Child mode: only the own team's schedule is visible and reminders fire. */
  lockTeam?: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const DAY_START = 7 * 60;
const DAY_END = 22 * 60;
const PX_PER_MIN = 1.25;
const GUTTER = 52;

const WEEKDAYS = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\u2019ятниця', 'Субота'];
const MONTHS = ['Січня', 'Лютого', 'Березня', 'Квітня', 'Травня', 'Червня', 'Липня', 'Серпня', 'Вересня', 'Жовтня', 'Листопада', 'Грудня'];

const prettyDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
};

const slotsOf = (i: ScheduleItem): ScheduleSubSlot[] =>
  Array.isArray(i.sub_slots) ? (i.sub_slots as ScheduleSubSlot[]).filter((s) => s && s.time) : [];

const ScheduleView = ({ myTeam = null, lockTeam = false }: Props) => {
  const TEAMS = useAllTeams();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState<number | null>(myTeam ?? null);
  const team = lockTeam ? myTeam ?? null : filterTeam;
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
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
      setActiveDay((cur) => cur ?? list.find((s) => s.date >= todayISO())?.date ?? list[0]?.date ?? null);
      setLoading(false);
    };
    load();
    const debounced = () => { clearTimeout(debounce); debounce = setTimeout(load, 600); };
    const ch = supabase
      .channel('schedule-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, debounced)
      .subscribe();
    return () => { clearTimeout(debounce); supabase.removeChannel(ch); };
  }, []);

  const daySchedule = schedules.find((s) => s.date === activeDay);

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
    if (!daySchedule) return [];
    return normalizeScheduleItems(items.filter((i) => i.schedule_id === daySchedule.id).filter(matchesTeam), daySchedule.date);
  }, [items, daySchedule?.id, daySchedule?.date, matchesTeam]);

  /** Yesterday's night events that are still running right now (cross-midnight). */
  const carryOver = useMemo<NormalizedScheduleItem[]>(() => {
    if (!activeDay) return [];
    const prev = schedules.find((s) => s.date === shiftISODate(activeDay, -1));
    if (!prev) return [];
    const prevEvents = normalizeScheduleItems(items.filter((i) => i.schedule_id === prev.id).filter(matchesTeam), prev.date);
    // Shift into the selected day's minute space (start is negative, i.e. before 00:00).
    return ongoingEvents(prevEvents, now).map((e) => ({ ...e, startMin: e.startMin - 1440, endMin: e.endMin - 1440 }));
  }, [items, schedules, activeDay, matchesTeam, now]);

  const visibleEvents = useMemo(() => [...carryOver, ...dayEvents], [carryOver, dayEvents]);
  const dayItems = useMemo(() => visibleEvents.map((e) => e.item), [visibleEvents]);

  /** Minutes since 00:00 of the selected day (can be < 0 or > 1440 for other days). */
  const nowRel = activeDay ? minutesSinceDayStart(activeDay, now) : -1;
  const isToday = nowRel >= 0 && nowRel < 1440;
  const nowMin = Math.round(nowRel);

  /** Absolute time-based tops, pushed down so cards never overlap each other. */
  const laidOut = useMemo(() => {
    let prevBottom = -Infinity;
    return visibleEvents.map((e) => {
      const slots = slotsOf(e.item);
      const minH = slots.length ? 96 + slots.length * 10 : 74;
      const height = Math.max(minH, (e.endMin - e.startMin) * PX_PER_MIN);
      const wanted = (Math.max(e.startMin, DAY_START) - DAY_START) * PX_PER_MIN;
      const top = Math.max(wanted, prevBottom + 8);
      prevBottom = top + height;
      return { event: e, item: e.item, top, height, range: e.range, startMin: e.startMin, endMin: e.endMin };
    });
  }, [visibleEvents]);

  const canvasHeight = Math.max(
    (DAY_END - DAY_START) * PX_PER_MIN + 24,
    ...laidOut.map((l) => (l.top ?? 0) + l.height + 24),
  );

  /* ---- local reminders: 5 min before + at start (today, own team only) ---- */
  const todaySchedule = schedules.find((s) => s.date === todayISO());
  const reminderEvents = useMemo<ReminderEvent[]>(() => {
    if (!lockTeam || !todaySchedule) return [];
    return items
      .filter((i) => i.schedule_id === todaySchedule.id)
      .filter((i) => team == null || !i.target_teams?.length || i.target_teams.includes(team) || slotsOf(i).some((s) => s.teams?.includes(team)))
      .map((i) => {
        const slot = team != null ? slotsOf(i).find((s) => s.teams?.includes(team)) : undefined;
        const startMin = toMinutes(slot?.time ?? i.time_start);
        if (startMin == null) return null;
        return { id: i.id, title: sentenceCase(i.title), startMin, timeLabel: fromMinutes(startMin) };
      })
      .filter(Boolean) as ReminderEvent[];
  }, [items, todaySchedule?.id, team, lockTeam]);

  // Reminders are delivered app-wide by useScheduleNotifier, not from this view.
  void reminderEvents;

  /** Next upcoming event of today for the summary strip. */
  const nextUp = useMemo(() => {
    if (!isToday) return null;
    const upcoming = laidOut.filter((l) => l.startMin > nowRel).sort((a, b) => a.startMin - b.startMin)[0];
    return upcoming ? { item: upcoming.item, inMin: Math.round(upcoming.startMin - nowRel), range: upcoming.range } : null;
  }, [laidOut, nowRel, isToday]);

  /** Currently running event — stays active until its exact endAt, even past 00:00. */
  const currentEvent = useMemo(() => {
    if (!isToday) return null;
    return laidOut.find((l) => nowRel >= l.startMin && nowRel < l.endMin) ?? null;
  }, [laidOut, nowRel, isToday]);
  const currentId = currentEvent?.item.id ?? null;

  const dayIdx = schedules.findIndex((s) => s.date === activeDay);
  const goDay = (delta: number) => {
    const next = schedules[dayIdx + delta];
    if (next) setActiveDay(next.date);
  };

  useEffect(() => {
    if (!isToday || !scrollRef.current) return;
    const top = Math.max(0, (nowMin - DAY_START) * PX_PER_MIN - 120);
    scrollRef.current.scrollTo({ top, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, loading]);

  if (loading) return <InlineLoader label="Завантаження розкладу" />;

  if (!schedules.length) {
    return (
      <Card className="p-8 text-center bg-gradient-card">
        <CalendarDays className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Розклад ще не опубліковано</p>
      </Card>
    );
  }

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, k) => DAY_START + k * 60);

  return (
    <div className="space-y-2.5">
      {/* Day header */}
      <Card className="p-3 bg-gradient-card space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goDay(-1)}
            disabled={dayIdx <= 0}
            className="h-9 w-9 shrink-0 rounded-xl border border-border/50 bg-surface-1 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-smooth"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-sm font-semibold truncate">{activeDay ? prettyDate(activeDay) : '—'}</p>
            <button
              onClick={() => {
                const t = schedules.find((s) => s.date === todayISO());
                if (t) setActiveDay(t.date);
              }}
              className={`text-[10px] uppercase tracking-wider font-bold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {isToday ? 'Сьогодні' : 'До сьогодні'}
            </button>
          </div>
          <button
            onClick={() => goDay(1)}
            disabled={dayIdx >= schedules.length - 1}
            className="h-9 w-9 shrink-0 rounded-xl border border-border/50 bg-surface-1 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-smooth"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {lockTeam ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface-1 px-2.5 py-1.5">
            <Users className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
            <p className="text-[11px] font-medium">Розклад твоєї команди {myTeam != null ? `№${myTeam}` : ''}</p>
            <Bell className="w-3.5 h-3.5 text-muted-foreground ml-auto" strokeWidth={1.75} />
          </div>
        ) : (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-0.5">
          <button
            onClick={() => setFilterTeam(null)}
            className={`shrink-0 h-8 px-3 rounded-lg text-[11px] font-bold border transition-smooth ${
              filterTeam === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-1 border-border/50 text-muted-foreground'
            }`}
          >Всі команди</button>
          {myTeam != null && (
            <button
              onClick={() => setFilterTeam(myTeam)}
              className={`shrink-0 h-8 px-3 rounded-lg text-[11px] font-bold border transition-smooth ${
                filterTeam === myTeam ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-1 border-border/50 text-muted-foreground'
              }`}
            >Моя команда (К{myTeam})</button>
          )}
          {TEAMS.filter((t) => t !== myTeam).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTeam(filterTeam === t ? null : t)}
              className={`shrink-0 h-8 w-8 rounded-lg text-[11px] font-bold border transition-smooth ${
                filterTeam === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-1 border-border/50 text-muted-foreground'
              }`}
            >{t}</button>
          ))}
        </div>
        )}
      </Card>

      {currentEvent && (
        <Card className="flex items-center gap-2.5 p-2.5 bg-card/80 backdrop-blur-md border-primary/40 ring-1 ring-primary/20">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Зараз триває</p>
            <p className="text-sm font-semibold truncate">{sentenceCase(currentEvent.item.title)}</p>
            <div className="mt-1 h-[3px] rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${Math.min(100, Math.max(0, ((nowRel - currentEvent.startMin) / Math.max(1, currentEvent.endMin - currentEvent.startMin)) * 100))}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground shrink-0">{currentEvent.range}</span>
        </Card>
      )}

      {nextUp && (
        <Card className="flex items-center gap-2.5 p-2.5 bg-card/80 backdrop-blur-md border-border/40">
          <Bell className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Далі</p>
            <p className="text-sm font-semibold truncate">{sentenceCase(nextUp.item.title)}</p>
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-primary shrink-0">
            {nextUp.inMin < 60 ? `через ${nextUp.inMin} хв` : nextUp.range?.split(' ')[0]}
          </span>
        </Card>
      )}

      {dayItems.length === 0 && (
        <Card className="p-6 text-center bg-card/50"><p className="text-sm text-muted-foreground">Подій немає</p></Card>
      )}

      {/* Timeline */}
      {dayItems.length > 0 && (
        <div ref={scrollRef} className="relative max-h-[65vh] overflow-y-auto scrollbar-thin rounded-2xl border border-border/40 bg-surface-1/60 p-2">
          <div className="relative" style={{ height: canvasHeight }}>
            {hours.map((h) => (
              <div key={h} className="absolute left-0 right-0 flex items-start gap-2" style={{ top: (h - DAY_START) * PX_PER_MIN }}>
                <span className="w-[44px] shrink-0 text-[10px] tabular-nums text-muted-foreground -mt-1.5 text-right">
                  {String(h / 60).padStart(2, '0')}:00
                </span>
                <div className="flex-1 border-t border-border/30" />
              </div>
            ))}

            {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none transition-all duration-1000" style={{ top: (nowMin - DAY_START) * PX_PER_MIN }}>
                <div className="flex items-center gap-1.5" style={{ marginLeft: GUTTER - 46 }}>
                  <span className="rounded-md bg-destructive px-1.5 py-[1px] text-[9px] font-semibold tabular-nums text-destructive-foreground shadow-sm">
                    {fromMinutes(nowMin)}
                  </span>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-destructive/60 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-destructive/70 to-destructive/10" />
                </div>
              </div>
            )}

            {laidOut.map(({ item: i, top, height, range, startMin, endMin }) => {
              const meta = catMeta(i.category);
              const Icon = meta.icon;
              const slots = slotsOf(i);
              const isNow = i.id === currentId;
              const progress = isNow ? Math.min(100, Math.max(0, ((nowRel - startMin) / Math.max(1, endMin - startMin)) * 100)) : 0;
              const past = isToday && nowRel >= endMin;
              const mySlot = team != null ? slots.find((s) => s.teams?.includes(team)) : undefined;
              return (
                <div key={i.id} className="absolute right-1 z-10" style={{ top, left: GUTTER, minHeight: height }}>
                  <div
                    className={`relative overflow-hidden rounded-xl border bg-card/80 backdrop-blur-md p-2.5 h-full transition-smooth ${
                      isNow ? 'border-primary/60 ring-1 ring-primary/30 shadow-lg' : 'border-border/40'
                    } ${past ? 'opacity-55' : ''}`}
                    style={{
                      borderLeft: `4px solid hsl(var(--cat-${meta.token}) / 0.8)`,
                      backgroundImage: `linear-gradient(100deg, hsl(var(--cat-${meta.token}) / 0.10), transparent 55%)`,
                    }}
                  >
                    {isNow && (
                      <div className="absolute bottom-0 left-0 h-[2px] bg-primary/70 transition-all duration-1000" style={{ width: `${progress}%` }} />
                    )}
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} style={{ color: `hsl(var(--cat-${meta.token}))` }} />
                      <p className="text-xs font-semibold tabular-nums tracking-tight">{range}</p>
                      {isNow && (
                        <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium bg-primary/10 text-primary border border-primary/30 ml-auto">
                          Зараз
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold break-words mt-0.5">{sentenceCase(i.title)}</p>
                    {i.description && <p className="text-[11px] text-muted-foreground break-words">{i.description}</p>}

                    {mySlot && (
                      <div className="mt-1.5 inline-flex items-center rounded-md bg-primary/10 border border-primary/30 text-primary px-2.5 py-1 text-xs font-medium tabular-nums">
                        Твій час: {mySlot.time} (Команди {mySlot.teams.join(' і ')})
                      </div>
                    )}

                    {slots.length > 0 && !mySlot && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {slots.map((s, k) => (
                          <span key={k} className="text-[10px] font-medium tabular-nums rounded-md bg-muted/50 border border-border/50 px-1.5 py-0.5 text-muted-foreground">
                            {s.time} · {s.teams.map((t) => `К${t}`).join(', ')}
                          </span>
                        ))}
                      </div>
                    )}

                    {!slots.length && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {i.target_teams?.length ? i.target_teams.map((t) => (
                          <Badge key={t} className={`text-[9px] px-1.5 py-0 h-4 border font-medium ${t === team ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted/50 text-muted-foreground border-border/50'}`}>
                            <Users className="w-2.5 h-2.5 mr-0.5" strokeWidth={1.75} />{t}
                          </Badge>
                        )) : (
                          <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium bg-muted/50 text-muted-foreground border border-border/50">Для всіх</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleView;