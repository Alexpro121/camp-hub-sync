import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Clock, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Schedule, ScheduleItem } from '@/types/app';
import { InlineLoader } from '@/components/ui/loader';

interface Props { myTeam?: number | null; }

const todayISO = () => new Date().toISOString().slice(0, 10);

const ScheduleView = ({ myTeam = null }: Props) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [now, setNow] = useState(new Date());

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
    if (onlyMine && myTeam != null) {
      list = list.filter((i) => !i.target_teams?.length || i.target_teams.includes(myTeam));
    }
    return list.sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index);
  }, [items, daySchedule?.id, onlyMine, myTeam]);

  const currentIdx = useMemo(() => {
    if (!daySchedule || daySchedule.date !== todayISO()) return -1;
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    let idx = -1;
    dayItems.forEach((i, k) => {
      if (i.time_start && i.time_start <= hhmm && (!i.time_end || i.time_end >= hhmm)) idx = k;
    });
    return idx;
  }, [dayItems, now, daySchedule]);

  if (loading) return <InlineLoader label="Завантаження розкладу" />;

  if (!schedules.length) {
    return (
      <Card className="p-8 text-center bg-gradient-card">
        <CalendarDays className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Розклад ще не опубліковано</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {schedules.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveDay(s.date)}
            className={`shrink-0 px-3 h-10 rounded-xl text-xs font-bold border transition-smooth ${
              activeDay === s.date ? 'bg-gradient-primary text-primary-foreground border-primary' : 'bg-surface-1 border-border/50 text-muted-foreground'
            }`}
          >
            {s.date.slice(8, 10)}.{s.date.slice(5, 7)}
          </button>
        ))}
      </div>

      {myTeam != null && (
        <button
          onClick={() => setOnlyMine((v) => !v)}
          className={`w-full h-10 rounded-xl text-xs font-bold border transition-smooth ${
            onlyMine ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-surface-1 border-border/50 text-muted-foreground'
          }`}
        >
          {onlyMine ? `Показано: загальні + команда #${myTeam}` : 'Показати все'}
        </button>
      )}

      <div className="space-y-2">
        {dayItems.length === 0 && (
          <Card className="p-6 text-center bg-card/50"><p className="text-sm text-muted-foreground">Подій немає</p></Card>
        )}
        {dayItems.map((i, k) => {
          const mine = myTeam != null && i.target_teams?.includes(myTeam);
          const isNow = k === currentIdx;
          return (
            <Card
              key={i.id}
              className={`p-3.5 flex gap-3 transition-smooth ${
                isNow ? 'bg-gradient-primary text-primary-foreground border-primary shadow-glow'
                : mine ? 'bg-gradient-card border-primary/40' : 'bg-surface-1 border-border/40'
              }`}
            >
              <div className="shrink-0 w-[62px]">
                <p className="text-sm font-black tabular-nums leading-tight">{i.time_start || '—'}</p>
                {i.time_end && <p className={`text-[10px] tabular-nums ${isNow ? 'opacity-80' : 'text-muted-foreground'}`}>{i.time_end}</p>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold break-words">{i.title}</p>
                {i.description && <p className={`text-xs mt-0.5 break-words ${isNow ? 'opacity-90' : 'text-muted-foreground'}`}>{i.description}</p>}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {i.target_teams?.length ? (
                    i.target_teams.map((t) => (
                      <Badge key={t} className={`text-[9px] px-1.5 py-0 h-4 border ${t === myTeam ? 'bg-primary/25 text-primary border-primary/40' : 'bg-secondary text-muted-foreground border-border'}`}>
                        <Users className="w-2.5 h-2.5 mr-0.5" />{t}
                      </Badge>
                    ))
                  ) : (
                    <Badge className="text-[9px] px-1.5 py-0 h-4 bg-secondary text-muted-foreground border-border">Загальне</Badge>
                  )}
                  {isNow && <Badge className="text-[9px] px-1.5 py-0 h-4 bg-background/30 border-0"><Clock className="w-2.5 h-2.5 mr-0.5" />зараз</Badge>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ScheduleView;