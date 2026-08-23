import { useEffect, useRef, useState } from 'react';
import { useHaptics } from '@/hooks/useHaptics';

const SESSION_KEY = 'iron_splash_shown';

export const shouldShowIntro = () => {
  try { return sessionStorage.getItem(SESSION_KEY) !== '1'; } catch { return false; }
};

interface Props {
  onDone: () => void;
}

/** Kinetic radio-call intro. Plays once per session, ~1.6s, GPU-only animations. */
const IntroSplash = ({ onDone }: Props) => {
  const haptics = useHaptics();
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  const done = useRef(false);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    const t1 = window.setTimeout(() => setPhase(1), 60);
    const t2 = window.setTimeout(() => setPhase(2), 520);
    const t3 = window.setTimeout(() => {
      setPhase(3);
      haptics.impact('medium');
    }, 1350);
    const t4 = window.setTimeout(() => {
      if (done.current) return;
      done.current = true;
      onDone();
    }, 1680);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center px-6 bg-background transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
        phase === 3 ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      style={{ background: 'var(--gradient-hero)' }}
      aria-hidden
    >
      <div className="w-full max-w-md text-center">
        <p
          className={`text-muted-foreground text-sm tracking-widest uppercase font-mono transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
            phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          — Ало, ало?
        </p>
        <h1
          className={`text-2xl sm:text-3xl font-black tracking-tight uppercase mt-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent ${
            phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          — Так-так, Залізна Зміна!
        </h1>
      </div>

      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-40 h-[2px] rounded-full bg-border/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary origin-left transition-transform duration-[1300ms] ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
          style={{ transform: `scaleX(${phase >= 1 ? 1 : 0})`, width: '100%' }}
        />
      </div>
    </div>
  );
};

export default IntroSplash;
