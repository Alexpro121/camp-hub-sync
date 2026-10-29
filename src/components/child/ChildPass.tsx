import { useEffect, useRef, useState } from 'react';
import { Award, ChevronRight } from 'lucide-react';
import IronPixelAvatar from '@/components/ui/IronPixelAvatar';

/** Animated count-up that eases toward the target; instant under reduced motion. */
function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setValue(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      setValue(Math.round(a + (target - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

interface Props {
  name: string;
  teamNumber: number;
  teamName?: string | null;
  balance: number;
  shortId: string;
  isDark: boolean;
  onCertificate: () => void;
  onCopyId: () => void;
}

export default function ChildPass({ name, teamNumber, teamName, balance, shortId, isDark, onCertificate, onCopyId }: Props) {
  const shown = useCountUp(balance);
  const firstName = name.trim().split(/\s+/)[1] || name.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Добраніч' : hour < 12 ? 'Доброго ранку' : hour < 18 ? 'Привіт' : 'Добрий вечір';

  return (
    <div className="space-y-4">
      <p className="cp-rise px-1 text-[15px]" style={{ animationDelay: '40ms' }}>
        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{greet}, </span>
        <span className="font-semibold">{firstName}</span>
      </p>

      <article
        className={`cp-rise cp-pass relative rounded-[26px] overflow-hidden ${isDark ? 'cp-pass--dark' : ''}`}
        style={{ animationDelay: '110ms' }}
        aria-label={`Перепустка учасника ${name}`}
      >
        {/* top band */}
        <div className="cp-band relative px-5 pt-4 pb-5">
          <div className="cp-rails" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] uppercase opacity-80">Перепустка учасника</p>
              <p className="mt-0.5 text-[13px] font-medium opacity-90">Залізна Зміна</p>
            </div>
            <button
              type="button"
              onClick={onCopyId}
              className="cp-chip font-mono text-[12px] px-2.5 py-1 rounded-lg active:scale-95 transition-transform"
              aria-label={`Скопіювати ID ${shortId}`}
            >
              {shortId}
            </button>
          </div>

          <div className="relative mt-5 flex items-end gap-4">
            <div className="cp-avatar shrink-0 rounded-2xl p-1">
              <IronPixelAvatar name={name} size={68} bare className="rounded-xl overflow-hidden" />
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              <h1 className="text-[21px] font-semibold leading-[1.15] tracking-[-0.02em] break-words">{name}</h1>
              {teamName && <p className="mt-1 text-[13px] opacity-85 capitalize truncate">{teamName}</p>}
            </div>
          </div>

          <div className="cp-team" aria-hidden>
            {String(teamNumber).padStart(2, '0')}
          </div>
        </div>

        {/* perforation */}
        <div className="cp-perf" aria-hidden />

        {/* stub */}
        <div className="cp-stub px-5 pt-4 pb-4">
          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <div>
              <p className="cp-muted text-[12px]">Баланс</p>
              <p className="mt-1 font-mono tabular-nums text-[38px] leading-none font-semibold tracking-[-0.04em] cp-accent">
                {shown}
                <span className="cp-muted ml-1.5 font-sans text-[13px] font-medium tracking-normal">А$</span>
              </p>
            </div>
            <div className="text-right">
              <p className="cp-muted text-[12px]">Команда</p>
              <p className="mt-1 text-[28px] leading-none font-semibold tabular-nums">№{teamNumber}</p>
            </div>
          </div>

          <div className="cp-barcode mt-4" aria-hidden />

          <button
            type="button"
            onClick={onCertificate}
            className="cp-cert group mt-4 w-full flex items-center justify-between gap-3 rounded-2xl pl-4 pr-1.5 min-h-[52px] text-[14px] font-medium active:scale-[0.98] transition-transform"
          >
            <span className="flex items-center gap-2.5">
              <Award className="w-4 h-4" strokeWidth={2} />
              Мій іменний сертифікат
            </span>
            <span className="cp-cert-icon w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5">
              <ChevronRight className="w-4 h-4" />
            </span>
          </button>
        </div>
      </article>
    </div>
  );
}
