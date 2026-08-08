import { memo } from 'react';
import { Users } from 'lucide-react';
import type { ScheduleItem, ScheduleSubSlot } from '@/types/app';
import { sentenceCase } from '@/lib/scheduleCategories';
import type { NormalizedScheduleItem } from '@/lib/schedule';

/** Left accent rail per category — deliberately restrained, four families only. */
const ACCENT: Record<string, string> = {
  meal: 'border-l-amber-500',
  sports: 'border-l-emerald-500',
  entertainment: 'border-l-indigo-500',
  gathering: 'border-l-indigo-500',
  transfer: 'border-l-sky-500',
  general: 'border-l-slate-500',
};

export const slotsOf = (i: ScheduleItem): ScheduleSubSlot[] =>
  Array.isArray(i.sub_slots) ? (i.sub_slots as ScheduleSubSlot[]).filter((s) => s && s.time) : [];

interface Props {
  event: NormalizedScheduleItem;
  /** Team the schedule is currently filtered to (child mode: own team). */
  team?: number | null;
  isNow?: boolean;
  past?: boolean;
  /** 0..100 elapsed share of the event, used for the bottom progress rail. */
  progress?: number;
}

const ScheduleCard = ({ event, team = null, isNow = false, past = false, progress = 0 }: Props) => {
  const item = event.item;
  const slots = slotsOf(item);
  const mySlot = team != null ? slots.find((s) => s.teams?.includes(team)) : undefined;
  const accent = ACCENT[item.category || 'general'] ?? ACCENT.general;

  return (
    <article
      className={[
        'relative overflow-hidden rounded-2xl border border-white/10 border-l-4 bg-slate-900/80 p-4 shadow-xl backdrop-blur-xl',
        'transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]',
        accent,
        isNow ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : '',
        past ? 'opacity-50' : '',
      ].join(' ')}
    >
      <header className="flex items-start gap-3">
        <span className="font-mono text-sm font-bold tabular-nums text-slate-200">
          {event.timeStart} – {event.timeEnd}
        </span>
        {isNow && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Зараз
          </span>
        )}
      </header>

      <h3 className="mt-1 break-words text-base font-bold tracking-tight text-white">
        {sentenceCase(item.title)}
      </h3>
      {item.description && (
        <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-400">{item.description}</p>
      )}

      {mySlot && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 shadow-sm">
          <span>
            Твій час: <span className="font-mono font-bold tabular-nums">{mySlot.time}</span>
          </span>
          <span className="text-amber-300/80">Команди {mySlot.teams.join(' і ')}</span>
        </div>
      )}

      {slots.length > 0 && !mySlot && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {slots.map((s, k) => (
            <span
              key={k}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300"
            >
              <span className="font-mono tabular-nums">{s.time}</span>
              <span className="mx-1 text-slate-500">→</span>
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
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                    : 'border-white/10 bg-white/5 text-slate-400'
                }`}
              >
                <Users className="h-2.5 w-2.5" strokeWidth={1.75} />
                {t}
              </span>
            ))
          ) : (
            <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
              Для всіх
            </span>
          )}
        </div>
      )}

      {isNow && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/5">
          <div
            className="h-full bg-emerald-400/80 transition-[width] duration-1000 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </article>
  );
};

export default memo(ScheduleCard);
