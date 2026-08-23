import { useEffect, useRef, useState } from 'react';
import { useHaptics } from '@/hooks/useHaptics';

const SESSION_KEY = 'iron_splash_seen';

export const shouldShowIntro = () => {
  try { return sessionStorage.getItem(SESSION_KEY) !== '1'; } catch { return false; }
};

interface Props {
  onDone: () => void;
}

/** Radio call-out intro over the Carpathian landscape. Once per session, ~2.1s. */
const IntroSplash = ({ onDone }: Props) => {
  const haptics = useHaptics();
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setPhase(3);
    haptics.impact('light');
    window.setTimeout(onDone, 420);
  };

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    const t1 = window.setTimeout(() => setPhase(1), 200);
    const t2 = window.setTimeout(() => setPhase((p) => (p === 3 ? p : 2)), 900);
    const t3 = window.setTimeout(finish, 2100);
    return () => { [t1, t2, t3].forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={finish}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center px-4 bg-black/40 backdrop-blur-[2px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
        phase === 3 ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`w-[280px] sm:w-[480px] h-[280px] sm:h-[480px] rounded-full bg-[#FA5A15]/25 blur-[100px] transition-all duration-500 ${
            phase >= 2 ? 'scale-125 opacity-100' : 'scale-75 opacity-60'
          }`}
        />
      </div>

      {/* Radio signal visualizer */}
      <div className="relative z-10 flex items-center gap-1.5 h-7 mb-5 sm:mb-8">
        <div className="sound-bar w-1 bg-[#FA5A15] rounded-full" />
        <div className="sound-bar w-1 bg-[#FF7D3B] rounded-full" />
        <div className="sound-bar w-1 bg-white rounded-full" />
        <div className="sound-bar w-1 bg-[#FF7D3B] rounded-full" />
        <div className="sound-bar w-1 bg-[#FA5A15] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-lg text-center flex flex-col items-center gap-3 sm:gap-4 px-2">
        <div
          className={`transition-all duration-500 ease-out will-change-transform ${
            phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <h2 className="font-brand text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-slate-100 drop-shadow-md">
            — АЛЛО, АЛЛО?
          </h2>
        </div>

        <div
          className={`transition-all duration-500 ease-out will-change-transform ${
            phase >= 2 ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
          }`}
        >
          <h2 className="font-brand text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-[#FA5A15] drop-shadow-[0_8px_32px_rgba(250,90,21,0.7)] leading-tight">
            — ТАК-ТАК, ЗАЛІЗНА ЗМІНА!
          </h2>
        </div>
      </div>

      <div className="absolute bottom-6 sm:bottom-8 text-[10px] sm:text-[11px] font-medium text-slate-400/80 tracking-wider uppercase">
        Торкніться для переходу
      </div>
    </div>
  );
};

export default IntroSplash;
