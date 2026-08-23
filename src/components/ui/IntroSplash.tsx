import { useEffect, useRef, useState } from 'react';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  /** Called once the intro is finished (auto after 1.8s or on tap). */
  onComplete: () => void;
}

/** Check if intro should be shown (first visit or localStorage cleared). */
export const shouldShowIntro = (): boolean => {
  if (typeof window === 'undefined') return false;
  const shown = localStorage.getItem('intro-shown');
  return !shown;
};

/** Mark intro as shown. */
const markIntroShown = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('intro-shown', 'true');
  }
};

/** Fully isolated opaque radio-call intro. Nothing underneath can shine through. */
const IntroSplash = ({ onComplete }: Props) => {
  const haptics = useHaptics();
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    markIntroShown();
    haptics.impact('light');
    setLeaving(true);
    window.setTimeout(onComplete, 320);
  };

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase(1), 150);
    const t2 = window.setTimeout(() => setPhase(2), 650);
    const t3 = window.setTimeout(finish, 1800);
    return () => { [t1, t2, t3].forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={finish}
      className={`fixed inset-0 z-[100] bg-[#05060D] flex flex-col items-center justify-center p-4 select-none cursor-pointer overflow-hidden transition-opacity duration-300 ease-out ${
        leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,90,21,0.18)_0%,transparent_70%)] pointer-events-none" />

      {/* Radio signal visualizer */}
      <div className="relative z-10 flex items-center gap-1.5 h-7 mb-6">
        <div className="sound-bar w-1 bg-[#FA5A15] rounded-full" />
        <div className="sound-bar w-1 bg-[#FF7D3B] rounded-full" />
        <div className="sound-bar w-1 bg-white rounded-full" />
        <div className="sound-bar w-1 bg-[#FF7D3B] rounded-full" />
        <div className="sound-bar w-1 bg-[#FA5A15] rounded-full" />
      </div>

      <div className="relative z-10 px-4 text-center max-w-sm sm:max-w-md mx-auto">
        <h2
          className={`font-brand text-xl xs:text-2xl sm:text-4xl font-black uppercase text-slate-200 tracking-tight leading-tight transition-all duration-500 ease-out will-change-transform ${
            phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          — АЛЛО, АЛЛО?
        </h2>
        <h1
          className={`font-brand text-2xl xs:text-3xl sm:text-5xl font-black uppercase text-[#FA5A15] tracking-tight leading-tight drop-shadow-[0_0_35px_rgba(250,90,21,0.75)] mt-2 transition-all duration-700 ease-out will-change-transform ${
            phase >= 2 ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'
          }`}
        >
          — ТАК-ТАК, ЗАЛІЗНА ЗМІНА!
        </h1>
      </div>

      <p className="absolute bottom-6 text-[10px] sm:text-xs text-slate-500 font-medium tracking-widest uppercase">
        Торкніться, щоб пропустити
      </p>
    </div>
  );
};

export default IntroSplash;
