import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Schedule, ScheduleItem, ScheduleSubSlot } from '@/types/app';
import { InlineLoader } from '@/components/ui/loader';
import { catMeta, fromMinutes, sentenceCase, toMinutes } from '@/lib/scheduleCategories';

/** Fallback duration when the source table has no end time. */
const DEFAULT_DURATION = 60;

interface Props { myTeam?: number | null; }

const todayISO = () => new Date().toISOString().slice(0, 10);
const TEAMS = [1, 2, 3, 4, 5, 6, 7, 8];
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

const ScheduleView = ({ myTeam = null }: Props) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [filterTeam, setFilterTeam] = useState<number | null>(myTeam ?? null);
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
  const dayItems = useMemo(() => {
    let list = items.filter((i) => i.schedule_id === daySchedule?.id);
    if (filterTeam != null) {
      list = list.filter((i) =>
        !i.target_teams?.length ||
        i.target_teams.includes(filterTeam) ||
        slotsOf(i).some((s) => s.teams?.includes(filterTeam)),
      );
    }
    return list.sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index);
  }, [items, daySchedule?.id, filterTeam]);

  const isToday = daySchedule?.date === todayISO();

  /** Absolute time-based tops, pushed down so cards never overlap each other. */
  const laidOut = useMemo(() => {
    let prevBottom = -Infinity;
    return dayItems.map((i, idx) => {
      const start = toMinutes(i.time_start);
      if (start == null) return { item: i, top: null as number | null, height: 0 };
      // Every event must show a full HH:MM – HH:MM range: derive the end from the
      // next event's start (capped) or fall back to a default duration.
      const nextStart = toMinutes(dayItems[idx + 1]?.time_start);
      const end =
        toMinutes(i.time_end) ??
        (nextStart != null && nextStart > start ? Math.min(nextStart, start + DEFAULT_DURATION) : start + DEFAULT_DURATION);
      const slots = slotsOf(i);
      const minH = slots.length ? 96 + slots.length * 10 : 74;
      const height = Math.max(minH, (end - start) * PX_PER_MIN);
      const wanted = (Math.max(start, DAY_START) - DAY_START) * PX_PER_MIN;
      const top = Math.max(wanted, prevBottom + 8);
      prevBottom = top + height;
      return { item: i, top, height, range: `${fromMinutes(start)} – ${fromMinutes(end)}`, endMin: end };
    });
  }, [dayItems]);

  const canvasHeight = Math.max(
    (DAY_END - DAY_START) * PX_PER_MIN + 24,
    ...laidOut.map((l) => (l.top ?? 0) + l.height + 24),
  );
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const currentId = useMemo(() => {
    if (!isToday) return null;
    let id: string | null = null;
    laidOut.forEach(({ item: i, endMin }) => {
      const s = toMinutes(i.time_start);
      if (s != null && endMin != null && nowMin >= s && nowMin < endMin) id = i.id;
    });
    return id;
  }, [laidOut, nowMin, isToday]);

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
    <div className="space-y-3">
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
            <p className="text-sm font-black truncate">{activeDay ? prettyDate(activeDay) : '—'}</p>
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

        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-0.5">
          <button
            onClick={() => setFilterTeam(null)}
            className={`shrink-0 h-8 px-3 rounded-lg text-[11px] font-bold border transition-smooth ${
              filterTeam === null ? 'bg-gradient-primary text-primary-foreground border-primary' : 'bg-surface-1 border-border/50 text-muted-foreground'
            }`}
          >Всі команди</button>
          {myTeam != null && (
            <button
              onClick={() => setFilterTeam(myTeam)}
              className={`shrink-0 h-8 px-3 rounded-lg text-[11px] font-bold border transition-smooth ${
                filterTeam === myTeam ? 'bg-gradient-primary text-primary-foreground border-primary' : 'bg-surface-1 border-border/50 text-muted-foreground'
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
      </Card>

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
                <div className="flex items-center gap-1" style={{ marginLeft: GUTTER - 14 }}>
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shadow-glow" />
                  <div className="flex-1 h-px bg-destructive" />
                </div>
              </div>
            )}

            {laidOut.map(({ item: i, top, height }) => {
              if (top == null) return null;
              const meta = catMeta(i.category);
              const slots = slotsOf(i);
              const isNow = i.id === currentId;
              const mySlot = filterTeam != null ? slots.find((s) => s.teams?.includes(filterTeam)) : undefined;
              return (
                <div key={i.id} className="absolute right-1 z-10" style={{ top, left: GUTTER, minHeight: height }}>
                  <div
                    className={`rounded-xl border p-2.5 h-full animate-fade-in transition-smooth ${
                      isNow ? 'border-primary shadow-glow animate-pulse-glow' : 'border-border/40'
                    }`}
                    style={{
                      background: `linear-gradient(135deg, hsl(var(--cat-${meta.token}) / 0.18), hsl(var(--surface-2)))`,
                      borderLeft: `3px solid hsl(var(--cat-${meta.token}))`,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{meta.emoji}</span>
                      <p className="text-xs font-black tabular-nums">
                        {i.time_start}{i.time_end ? ` – ${i.time_end}` : ''}
                      </p>
                      {isNow && (
                        <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/25 text-primary border border-primary/40 ml-auto">
                          <Clock className="w-2.5 h-2.5 mr-0.5" />зараз
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-bold break-words mt-0.5">{i.title}</p>
                    {i.description && <p className="text-[11px] text-muted-foreground break-words">{i.description}</p>}

                    {mySlot && (
                      <div className="mt-1.5 rounded-lg bg-gradient-primary text-primary-foreground px-2 py-1.5 text-[11px] font-bold flex items-center gap-1.5 animate-scale-in">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        Твій захід: {mySlot.time} (Команди {mySlot.teams.join(' і ')})
                      </div>
                    )}

                    {slots.length > 0 && !mySlot && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {slots.map((s, k) => (
                          <span key={k} className="text-[10px] font-bold tabular-nums rounded-md bg-background/40 border border-border/50 px-1.5 py-0.5">
                            {s.time} → {s.teams.map((t) => `К${t}`).join(', ')}
                          </span>
                        ))}
                      </div>
                    )}

                    {!slots.length && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {i.target_teams?.length ? i.target_teams.map((t) => (
                          <Badge key={t} className={`text-[9px] px-1.5 py-0 h-4 border ${t === filterTeam ? 'bg-primary/25 text-primary border-primary/40' : 'bg-secondary text-muted-foreground border-border'}`}>
                            <Users className="w-2.5 h-2.5 mr-0.5" />{t}
                          </Badge>
                        )) : (
                          <Badge className="text-[9px] px-1.5 py-0 h-4 bg-secondary text-muted-foreground border-border">Для всіх</Badge>
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