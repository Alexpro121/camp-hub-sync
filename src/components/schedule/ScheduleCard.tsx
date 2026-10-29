import { memo, useEffect, useState } from 'react';
import { Radio, ShoppingBag, Users, MapPin, Utensils, Dumbbell, Music2, Bus, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';

import type { ScheduleItem, ScheduleSubSlot } from '@/types/app';
import { sentenceCase, toMinutes } from '@/lib/scheduleCategories';
import type { NormalizedScheduleItem } from '@/lib/schedule';
import { isEventLive, isFairEvent } from '@/lib/fair-resolver';

/** Left accent rail per category — deliberately restrained, four families only. */
const ACCENT: Record<string, string> = {
  meal: 'border-l-cat-meal',
  sports: 'border-l-cat-sports',
  entertainment: 'border-l-cat-event',
  gathering: 'border-l-cat-gathering',
  transfer: 'border-l-cat-transfer',
  general: 'border-l-cat-general',
};

const CATEGORY_ICONS = { meal: Utensils, sports: Dumbbell, entertainment: Music2, gathering: Users, transfer: Bus, general: CalendarDays };

const toMin = (t?: string | null): number | null => toMinutes(t);

/**
 * A sub-slot is only valid when its time sits inside [time_start .. time_end]
 * of its parent event (cross-midnight aware). Broken rows are never rendered.
 */
export const slotInsideEvent = (slotTime: string, item: ScheduleItem): boolean => {
  const s = toMin(item.time_start);
  const t = toMin(slotTime);
  if (t == null) return false;
  if (s == null) return true;
  let e = toMin(item.time_end);
  if (e == null) return t >= s;
  let tt = t;
  if (e < s) e += 1440;            // event crosses midnight
  if (tt < s) tt += 1440;
  return tt >= s && tt <= e;
};

export const slotsOf = (i: ScheduleItem): ScheduleSubSlot[] =>
  i.has_sub_slots === false
    ? []
    : Array.isArray(i.sub_slots)
      ? (i.sub_slots as ScheduleSubSlot[]).filter((s) => s && s.time && slotInsideEvent(s.time, i))
      : [];

interface Props {
  event: NormalizedScheduleItem;
  /** Team the schedule is currently filtered to (child mode: own team). */
  team?: number | null;
  isNow?: boolean;
  past?: boolean;
  /** 0..100 elapsed share of the event, used for the bottom progress rail. */
  progress?: number;
  /** Staff (supervisor) view — opens the stand cash register instead of the scanner. */
  isStaff?: boolean;
  /** Opens the fair cash register / scanner from inside the live fair card. */
  onFairAction?: () => void;
}

const ScheduleCard = ({ event, team = null, isNow = false, past = false, progress = 0, isStaff = false, onFairAction }: Props) => {
  const item = event.item;
  const slots = slotsOf(item);
  const mySlot = team != null ? slots.find((s) => s.teams?.map(Number).includes(Number(team))) : undefined;
  const accent = ACCENT[item.category || 'general'] ?? ACCENT.general;
  const CategoryIcon = CATEGORY_ICONS[item.category as keyof typeof CATEGORY_ICONS] ?? CalendarDays;
  const isFair = isFairEvent(item);

  /**
   * The fair CTA lives strictly inside the OVERALL event range (e.g. 18:26–18:56).
   * It is time-driven, so it never blinks when parents re-render or notifications
   * are dismissed, and sub-slots never shorten it.
   */
  const [live, setLive] = useState(() => isFair && isEventLive(event));
  useEffect(() => {
    if (!isFair) { setLive(false); return; }
    const check = () => setLive(isEventLive(event));
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, [isFair, event]);

  const fairLive = isFair && (live || isNow);

  return (
    <article
      className={[
        'relative overflow-hidden rounded-lg border border-border border-l-[3px] bg-card p-4',
        'transition-colors duration-200 motion-reduce:transition-none',
        accent,
        isNow ? 'ring-1 ring-success/40 bg-success/5' : '',
        past ? 'opacity-65' : '',
      ].join(' ')}
    >

      <header className="flex items-center gap-2.5">
        <span className="font-mono text-xl font-bold tabular-nums text-foreground">
          {event.timeStart}
        </span>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">— {event.timeEnd}</span>
        <CategoryIcon className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {isNow && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-[10px] font-bold text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Зараз
          </span>
        )}
      </header>

      <h3 className="mt-3 break-words text-base font-semibold leading-snug text-foreground">
        {fairLive ? 'Розпочалася Ярмарка!' : sentenceCase(item.title)}
      </h3>

      {item.location && (
        <span className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" /> {item.location}
        </span>
      )}

      {fairLive && (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
          <ShoppingBag className="h-3.5 w-3.5" /> Касу відкрито
        </span>
      )}

      {fairLive && onFairAction && (
        <Button
          type="button"
          onClick={onFairAction}
          className="mt-3 w-full gap-2"
        >
          {isStaff ? (
            <><Radio className="h-4 w-4" strokeWidth={2} /> Відкрити касу (Air Pay)</>
          ) : (
            <><ShoppingBag className="h-4 w-4" strokeWidth={2} /> Відкрити Air Pay та сплатити</>
          )}
        </Button>
      )}

      {item.description && (
        <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{item.description}</p>
      )}

      {mySlot && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          <span>
            Твій час: <span className="font-mono font-bold tabular-nums">{mySlot.time}</span>
          </span>
          <span>Команди {mySlot.teams.join(' і ')}</span>
        </div>
      )}

      {slots.length > 0 && !mySlot && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {slots.map((s, k) => (
            <span
              key={k}
              className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              <span className="font-mono tabular-nums">{s.time}</span>
              <span className="mx-1 text-muted-foreground">→</span>
              Команди {s.teams.join(', ')}
            </span>
          ))}
        </div>
      )}

      {!slots.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.target_teams?.length ? (
            item.target_teams.map((t) => (
              <span
                key={t}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                  t === team
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground'
                }`}
              >
                <Users className="h-2.5 w-2.5" strokeWidth={1.75} />
                {t}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              Для всіх
            </span>
          )}
        </div>
      )}

      {isNow && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-success/10">
          <div
            className="h-full bg-success transition-[width] duration-1000 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </article>
  );
};

export default memo(ScheduleCard);
