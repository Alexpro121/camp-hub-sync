import { memo } from 'react';
import { QrCode, ShoppingBag, Users } from 'lucide-react';
import type { ScheduleItem, ScheduleSubSlot } from '@/types/app';
import { sentenceCase } from '@/lib/scheduleCategories';
import type { NormalizedScheduleItem } from '@/lib/schedule';

const FAIR_RE = /(ярмарок|ярмарка|ярмарки|ярмарков|fair|market)/i;

/** Left accent rail per category — deliberately restrained, four families only. */
const ACCENT: Record<string, string> = {
  meal: 'border-l-amber-500',
  sports: 'border-l-emerald-500',
  entertainment: 'border-l-indigo-500',
  gathering: 'border-l-indigo-500',
  transfer: 'border-l-sky-500',
  general: 'border-l-slate-500',
};

const toMin = (t?: string | null): number | null => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

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
  const mySlot = team != null ? slots.find((s) => s.teams?.includes(team)) : undefined;
  const accent = ACCENT[item.category || 'general'] ?? ACCENT.general;
  const isFair = FAIR_RE.test(`${item.title ?? ''} ${item.description ?? ''}`);
  /** The fair extras (tip + register button) only exist while the fair runs. */
  const fairLive = isFair && isNow;

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
        {isFair && isNow ? 'Розпочалася Ярмарка!' : sentenceCase(item.title)}
      </h3>

      {isFair && isNow && (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.35)]">
          🛍️ Касу відкрито
        </span>
      )}

      {fairLive && (
        <div className="my-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200 shadow-sm backdrop-blur-md">
          <span className="font-bold text-amber-300">💡 Корисна порада:</span> Обирайте одразу декілька товарів на стенді та сплачуйте за все разом однією сумою в 1 клік!
        </div>
      )}

      {fairLive && onFairAction && (
        <button
          type="button"
          onClick={onFairAction}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:from-amber-400 hover:to-amber-500 active:scale-95"
        >
          {isStaff ? (
            <><QrCode className="h-4 w-4" strokeWidth={2} /> Відкрити Касу Стенду та QR-код</>
          ) : (
            <><ShoppingBag className="h-4 w-4" strokeWidth={2} /> Відкрити QR-сканер камери</>
          )}
        </button>
      )}
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
