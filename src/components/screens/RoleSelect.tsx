import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowRight, Award, Sparkles } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import MountainLandscape from '@/components/home/MountainLandscape';
import type { Screen } from '@/pages/Index';

interface Props {
  onSelect: (s: Screen) => void;
}

const isTouchDevice = () => typeof window !== 'undefined' && 'ontouchstart' in window;

/** Cinematic home screen: living Carpathian backdrop + 3D tilt role cards. */
const RoleSelect = ({ onSelect }: Props) => {
  const haptics = useHaptics();
  const heroRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);

  const onTilt = (ref: React.RefObject<HTMLDivElement>) => (e: ReactMouseEvent<HTMLDivElement>) => {
    const card = ref.current;
    if (!card || isTouchDevice()) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -5;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 5;
    card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(4px)`;
  };

  const onTiltLeave = (ref: React.RefObject<HTMLDivElement>) => () => {
    const card = ref.current;
    if (!card) return;
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  };

  const onRipple = (ref: React.RefObject<HTMLDivElement>) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const card = ref.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height);
    const circle = document.createElement('span');
    circle.className = 'ripple-effect';
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
    circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
    card.appendChild(circle);
    window.setTimeout(() => circle.remove(), 700);
  };

  const pick = (s: Screen) => { haptics.impact('light'); onSelect(s); };

  return (
    <div className="relative min-h-[100dvh] h-[100dvh] w-full flex flex-col justify-between items-center overflow-hidden p-3 sm:p-6 md:p-8 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <MountainLandscape />

      <div className="relative z-10 w-full max-w-md sm:max-w-lg my-auto flex flex-col items-center text-center animate-fade-in">
        {/* Header */}
        <header className="flex flex-col items-center mb-4 sm:mb-6 md:mb-8 select-none w-full">
          <div className="relative mb-3 sm:mb-4 md:mb-5 group">
            <div className="absolute inset-0 bg-[#FA5A15]/40 rounded-full blur-2xl opacity-80 group-hover:opacity-100 group-hover:blur-3xl transition-all duration-700" />
            <div className="absolute -inset-4 bg-gradient-to-r from-[#FA5A15]/20 via-[#FF7D3B]/15 to-[#FA5A15]/20 rounded-full blur-xl animate-pulse" />
            <img
              src="https://www.ironsquad.org.ua/img/logo-zz.svg"
              alt="Залізна Зміна"
              loading="eager"
              className="relative h-16 sm:h-24 md:h-28 lg:h-32 w-auto object-contain drop-shadow-[0_10px_30px_rgba(250,90,21,0.6)] transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[9px] sm:text-[11px] font-bold tracking-[0.25em] text-slate-200 uppercase backdrop-blur-md mb-1.5 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FA5A15] shadow-[0_0_8px_#fa5a15] animate-pulse" />
            Система координації
          </div>

          <h1 className="text-[10px] sm:text-xs font-extrabold tracking-[0.3em] text-slate-400 uppercase">
            Camp Hub
          </h1>
        </header>

        {/* Role cards */}
        <main className="w-full flex flex-col gap-2.5 sm:gap-3.5 text-left">
          <div className="card-hero-wrap">
            <div
              ref={heroRef}
              role="button"
              tabIndex={0}
              onMouseMove={onTilt(heroRef)}
              onMouseLeave={onTiltLeave(heroRef)}
              onPointerDown={onRipple(heroRef)}
              onClick={() => pick('child')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pick('child'); }}
              className="card-hero spotlight group p-3.5 sm:p-5 md:p-6 cursor-pointer select-none overflow-hidden"
            >
              <div className="card-hero-bg" />
              <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-b from-[#1E2A42] to-[#0F1626] border border-white/20 flex items-center justify-center shadow-lg group-hover:border-[#FA5A15]/80 group-hover:shadow-[0_0_24px_rgba(250,90,21,0.5)] transition-all duration-300">
                      <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-[#FA5A15] group-hover:rotate-12 transition-transform duration-500" strokeWidth={2.2} />
                    </div>
                    <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-[#FA5A15]/25 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>

                  <div className="min-w-0 pr-1">
                    <h2 className="text-base sm:text-xl md:text-2xl font-black text-white tracking-wide">Я учасник</h2>
                    <p className="text-[11px] sm:text-xs md:text-sm text-slate-300 mt-0.5 leading-tight sm:leading-relaxed">
                      Особистий кабінет, баланс Айрон Доларів та розклад
                    </p>
                  </div>
                </div>

                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-white group-hover:bg-[#FA5A15] group-hover:border-[#FA5A15] group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 shadow-md">
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.4} />
                </div>
              </div>
            </div>
          </div>

          <div className="card-hero-wrap">
            <div
              ref={secondaryRef}
              role="button"
              tabIndex={0}
              onMouseMove={onTilt(secondaryRef)}
              onMouseLeave={onTiltLeave(secondaryRef)}
              onPointerDown={onRipple(secondaryRef)}
              onClick={() => pick('supervisor')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pick('supervisor'); }}
              className="card-secondary spotlight group px-3.5 py-2.5 sm:px-4 sm:py-3.5 cursor-pointer select-none overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#FA5A15] to-[#D94500] flex items-center justify-center flex-shrink-0 shadow-md shadow-[#FA5A15]/25 group-hover:scale-105 group-hover:shadow-[0_0_18px_rgba(250,90,21,0.5)] transition-all duration-300">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white" strokeWidth={2.4} />
                  </div>

                  <div className="min-w-0 pr-1">
                    <h2 className="text-xs sm:text-sm md:text-base font-bold text-slate-200 tracking-wide group-hover:text-white transition-colors">
                      Я супровід
                    </h2>
                    <p className="text-[10px] sm:text-xs text-slate-400 leading-tight mt-0.5 truncate sm:whitespace-normal">
                      Керування командою, присутність та активності
                    </p>
                  </div>
                </div>

                <div className="text-slate-500 group-hover:text-[#FA5A15] group-hover:translate-x-1 transition-all duration-300 pl-1 flex-shrink-0">
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.2} />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="relative z-10 w-full text-center py-2 text-[10px] sm:text-xs text-slate-500 font-medium select-none flex items-center justify-center gap-1.5">
        <span>Залізна Зміна</span>
        <span className="text-slate-700">•</span>
        <span>Camp Hub</span>
      </footer>
    </div>
  );
};

export default RoleSelect;
