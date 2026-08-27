import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Coins,
  Lock,
  Radio,
  ReceiptText,
  Loader2,
  Timer,
  ArrowLeftRight,
  PartyPopper,
} from 'lucide-react';

/** Типи живих демонстрацій кроків туру */
export type TourDemo =
  | 'presence'
  | 'iron'
  | 'notes'
  | 'bank'
  | 'airpay-idle'
  | 'airpay-push'
  | 'timer'
  | 'transfers'
  | 'export'
  | 'finale';

const BRAND = '#FA5A15';

/* ------------------------------------------------------------------ */
/* Віртуальний тач-індикатор (Ghost Finger / Ripple Pointer)           */
/* ------------------------------------------------------------------ */
export const TourTouchRipple = ({
  x,
  y,
  active = true,
}: {
  x: number;
  y: number;
  active?: boolean;
}) => {
  if (!active) return null;
  return (
    <div
      className="absolute top-0 left-0 pointer-events-none transform-gpu will-change-transform"
      style={{ transform: `translate3d(${x - 28}px, ${y - 28}px, 0)` }}
      aria-hidden="true"
    >
      <span className="tour-ripple-wave absolute inset-0 w-14 h-14 rounded-full border-2" style={{ borderColor: BRAND }} />
      <span
        className="tour-ripple-wave absolute inset-0 w-14 h-14 rounded-full border-2"
        style={{ borderColor: BRAND, animationDelay: '0.6s' }}
      />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
        style={{ background: `${BRAND}`, opacity: 0.55, boxShadow: `0 0 22px ${BRAND}` }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Допоміжні хуки анімації                                             */
/* ------------------------------------------------------------------ */
const useCountUp = (from: number, to: number, duration = 900, run = true) => {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duration, run]);
  return value;
};

const useTyping = (text: string, speed = 45) => {
  const [out, setOut] = useState('');
  useEffect(() => {
    setOut('');
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return out;
};

/* ------------------------------------------------------------------ */
/* Загальна оболонка демо-віджета                                      */
/* ------------------------------------------------------------------ */
const DemoShell = ({ children }: { children: React.ReactNode }) => (
  <div className="tour-demo-card rounded-2xl border border-white/15 bg-[#0A0E18]/95 backdrop-blur-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)] p-3 text-slate-100">
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/* Демо-сцени                                                          */
/* ------------------------------------------------------------------ */
const PresenceDemo = () => (
  <DemoShell>
    <div className="flex items-center gap-3">
      <span className="relative w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
        <Check className="w-5 h-5 text-emerald-400" />
        <span className="absolute inset-0 rounded-xl border-2 border-emerald-400/60 tour-ripple-wave" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-white truncate">Остапенко Максим</p>
        <p className="text-[11px] text-emerald-400 font-mono">присутній • збережено за 0 мс</p>
      </div>
    </div>
  </DemoShell>
);

const IronDemo = () => {
  const value = useCountUp(150, 160, 1100);
  return (
    <DemoShell>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${BRAND}26`, border: `1px solid ${BRAND}55` }}>
          <Coins className="w-5 h-5" style={{ color: BRAND }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-widest font-mono text-slate-400">Нарахування</p>
          <p className="font-mono font-bold text-lg text-white tabular-nums">{value} А$</p>
        </div>
        <span className="px-2 py-1 rounded-lg text-[11px] font-mono font-bold animate-pulse" style={{ background: `${BRAND}22`, color: BRAND }}>
          +10 А$
        </span>
      </div>
    </DemoShell>
  );
};

const NotesDemo = () => {
  const text = useTyping('Активний учасник, капітан квізу');
  return (
    <DemoShell>
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-[10px] font-bold text-slate-300">
          <Lock className="w-3 h-3" /> Бачить лише супровід та штаб
        </span>
        <p className="text-xs text-slate-200 font-mono min-h-[16px]">
          {text}
          <span className="inline-block w-1.5 h-3.5 align-middle ml-0.5 animate-pulse" style={{ background: BRAND }} />
        </p>
      </div>
    </DemoShell>
  );
};

const BankDemo = () => {
  const value = useCountUp(0, 750, 1200);
  const pct = Math.round((value / 1000) * 100);
  return (
    <DemoShell>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] uppercase tracking-widest font-mono text-slate-400">Фонд команди</p>
          <p className="font-mono font-bold text-sm text-white tabular-nums">{value} / 1000 А$</p>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${BRAND}, #FF7D3B)` }}
          />
        </div>
        <p className="text-[11px] font-mono text-slate-400">Використано {pct}% ліміту зміни</p>
      </div>
    </DemoShell>
  );
};

const AirPayIdleDemo = () => (
  <DemoShell>
    <div className="flex items-center gap-3">
      <span className="relative w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${BRAND}22` }}>
        <Radio className="w-5 h-5" style={{ color: BRAND }} />
        <span className="absolute inset-0 rounded-full border-2 tour-ripple-wave" style={{ borderColor: BRAND }} />
      </span>
      <div>
        <p className="text-xs font-bold text-white">Каса Air Pay активна</p>
        <p className="text-[11px] font-mono text-slate-400">Очікуємо запити по повітрю…</p>
      </div>
    </div>
  </DemoShell>
);

const AirPayPushDemo = ({ teamNumber }: { teamNumber: number }) => {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    setPhase(0);
    const t1 = setTimeout(() => setPhase(1), 1500);
    const t2 = setTimeout(() => setPhase(2), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const balance = useCountUp(150, 100, 700, phase === 2);

  return (
    <div className="space-y-2">
      <div
        className={`tour-demo-card rounded-2xl border p-3 transition-colors duration-300 ${
          phase >= 1 ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/15 bg-[#0A0E18]/95'
        } backdrop-blur-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)]`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">Остапенко Максим</p>
            <p className="text-[11px] font-mono text-slate-400">Каса №{teamNumber} • вхідний запит</p>
          </div>
          <p className="font-mono font-bold text-base text-white tabular-nums">50 А$</p>
        </div>
        <div
          className={`mt-2 h-11 rounded-xl flex items-center justify-center text-xs font-bold uppercase transition-all ${
            phase >= 1 ? 'bg-emerald-500 text-white scale-[0.97]' : 'text-white'
          }`}
          style={phase >= 1 ? undefined : { background: BRAND }}
        >
          {phase >= 1 ? <><Check className="w-4 h-4 mr-1" /> Списано 50 А$</> : 'Списати 50 А$'}
        </div>
      </div>

      {phase === 2 && (
        <div className="animate-fade-in rounded-2xl border border-white/15 bg-[#0A0E18]/95 backdrop-blur-2xl p-3 flex items-center gap-3">
          <ReceiptText className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-slate-400">Цифровий чек</p>
            <p className="text-xs font-mono font-bold text-white tabular-nums">Новий баланс: {balance} А$</p>
          </div>
        </div>
      )}
    </div>
  );
};

const TimerDemo = () => {
  const [left, setLeft] = useState(304);
  useEffect(() => {
    const iv = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, []);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <DemoShell>
      <div className="flex items-center gap-3">
        <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase animate-pulse" style={{ background: `${BRAND}22`, color: BRAND }}>
          Зараз
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">Командний челендж</p>
          <p className="text-[11px] font-mono text-slate-400">до наступної події</p>
        </div>
        <span className="inline-flex items-center gap-1 font-mono font-bold text-sm text-white tabular-nums">
          <Timer className="w-4 h-4 text-slate-400" />
          {mm}:{ss}
        </span>
      </div>
    </DemoShell>
  );
};

const TransfersDemo = () => (
  <DemoShell>
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-xl bg-white/5 border border-white/10 p-2 text-center">
        <p className="text-[10px] font-mono text-slate-400">Команда 1</p>
        <p className="text-xs font-bold text-white truncate">Остапенко М.</p>
      </div>
      <ArrowLeftRight className="w-5 h-5 shrink-0 tour-swap-arrows" style={{ color: BRAND }} />
      <div className="flex-1 rounded-xl bg-white/5 border border-white/10 p-2 text-center">
        <p className="text-[10px] font-mono text-slate-400">Команда 4</p>
        <p className="text-xs font-bold text-white truncate">Гриценко А.</p>
      </div>
    </div>
  </DemoShell>
);

const ExportDemo = () => (
  <DemoShell>
    <div className="flex items-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
      <p className="text-xs font-mono text-slate-200">Формування звіту зміни…</p>
    </div>
  </DemoShell>
);

const FinaleDemo = () => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: (i * 5.3) % 100,
        delay: (i % 6) * 0.18,
        color: ['#FA5A15', '#FF7D3B', '#34D399', '#60A5FA', '#FDE047'][i % 5],
      })),
    [],
  );
  return (
    <div className="relative">
      <div className="absolute -top-24 left-0 right-0 h-24 overflow-hidden pointer-events-none">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="tour-confetti absolute top-0 w-1.5 h-3 rounded-[2px]"
            style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s` }}
          />
        ))}
      </div>
      <DemoShell>
        <div className="flex items-center gap-3">
          <PartyPopper className="w-5 h-5" style={{ color: BRAND }} />
          <div>
            <p className="text-xs font-bold text-white">Штаб проєкту</p>
            <p className="text-[11px] font-mono text-slate-400">Навчання пройдено. Бажаємо крутої зміни!</p>
          </div>
        </div>
      </DemoShell>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Публічний рендерер демо-сцени                                       */
/* ------------------------------------------------------------------ */
export const TourDemoStage = ({
  demo,
  stepKey,
  teamNumber,
}: {
  demo?: TourDemo;
  stepKey: number;
  teamNumber: number;
}) => {
  const mounted = useRef(0);
  mounted.current = stepKey;
  if (!demo) return null;

  switch (demo) {
    case 'presence':
      return <PresenceDemo key={stepKey} />;
    case 'iron':
      return <IronDemo key={stepKey} />;
    case 'notes':
      return <NotesDemo key={stepKey} />;
    case 'bank':
      return <BankDemo key={stepKey} />;
    case 'airpay-idle':
      return <AirPayIdleDemo key={stepKey} />;
    case 'airpay-push':
      return <AirPayPushDemo key={stepKey} teamNumber={teamNumber} />;
    case 'timer':
      return <TimerDemo key={stepKey} />;
    case 'transfers':
      return <TransfersDemo key={stepKey} />;
    case 'export':
      return <ExportDemo key={stepKey} />;
    case 'finale':
      return <FinaleDemo key={stepKey} />;
    default:
      return null;
  }
};

export default TourDemoStage;
