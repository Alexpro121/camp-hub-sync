import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowRight, Award, Medal, Sparkles } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import MountainLandscape from '@/components/home/MountainLandscape';
import type { Screen } from '@/pages/Index';

interface Props {
  onSelect: (s: Screen) => void;
}

const isTouchDevice = () => typeof window !== 'undefined' && 'ontouchstart' in window;

/** Головний екран вибору ролі: карпатський пейзаж + 3D Tilt картки Obsidian Glassmorphism */
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
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -4;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 4;
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
    window.setTimeout(() => {
      if (circle.parentNode === card) {
        card.removeChild(circle);
      }
    }, 700);
  };

  const pick = (s: Screen) => {
    haptics.impact('light');
    onSelect(s);
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between items-center overflow-hidden p-3.5 sm:p-6 md:p-8 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] bg-[#05070D] font-sans select-none">
      {/* Карпатський неоновий бекграунд */}
      <MountainLandscape />

      <div className="relative z-10 w-full max-w-md sm:max-w-lg my-auto flex flex-col items-center text-center animate-fade-in py-2">
        
        {/* Шапка з фірмовим логотипом */}
        <header className="flex flex-col items-center mb-5 sm:mb-7 md:mb-8 select-none w-full">
          <div className="relative mb-3 sm:mb-4 group">
            <div className="absolute inset-0 bg-[#FA5A15]/35 rounded-full blur-2xl opacity-75 group-hover:opacity-100 group-hover:blur-3xl transition-all duration-700" />
            <div className="absolute -inset-3 bg-gradient-to-r from-[#FA5A15]/20 via-[#FF7D3B]/15 to-[#FA5A15]/20 rounded-full blur-xl animate-pulse" />
            <img
              src="https://www.ironsquad.org.ua/img/logo-zz.svg"
              alt="Залізна Зміна"
              loading="eager"
              className="relative h-14 sm:h-20 md:h-24 lg:h-28 w-auto object-contain drop-shadow-[0_10px_30px_rgba(250,90,21,0.55)] transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[10px] sm:text-[11px] font-bold tracking-[0.25em] text-slate-200 uppercase backdrop-blur-md mb-1.5 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FA5A15] shadow-[0_0_8px_#fa5a15] animate-pulse" />
            Система координації
          </div>

          <h1 className="text-[10px] sm:text-xs font-extrabold tracking-[0.28em] text-slate-400 uppercase">
            Всеукраїнський проєкт
          </h1>
        </header>

        {/* Картки вибору ролей */}
        <main className="w-full flex flex-col gap-3 sm:gap-4 text-left">
          
          {/* 1. РОЛЬ: УЧАСНИК (Hero Card) */}
          <div className="card-hero-wrap">
            <div
              ref={heroRef}
              role="button"
              tabIndex={0}
              onMouseMove={onTilt(heroRef)}
              onMouseLeave={onTiltLeave(heroRef)}
              onPointerDown={onRipple(heroRef)}
              onClick={() => pick('child')}
              onKeyDown={(e) => { 
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick('child');
                }
              }}
              className="card-hero spotlight group p-4 sm:p-5 md:p-6 cursor-pointer select-none overflow-hidden rounded-3xl bg-[#0A0E18]/85 border border-white/10 backdrop-blur-2xl shadow-xl hover:border-[#FA5A15]/50 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FA5A15]"
              aria-label="Вхід для учасника проєкту"
            >
              <div className="card-hero-bg" />
              <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-b from-[#1E2A42] to-[#0F1626] border border-white/15 flex items-center justify-center shadow-lg group-hover:border-[#FA5A15] group-hover:shadow-[0_0_24px_rgba(250,90,21,0.45)] transition-all duration-300">
                      <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-[#FA5A15] group-hover:rotate-12 transition-transform duration-500" strokeWidth={2.2} />
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-[#FA5A15]/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>

                  <div className="min-w-0 pr-1">
                    <h2 className="text-base sm:text-lg md:text-xl font-black text-white tracking-wide group-hover:text-white transition-colors">
                      Я учасник
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-snug sm:leading-relaxed">
                      Особистий кабінет, баланс А$ та розклад дня
                    </p>
                  </div>
                </div>

                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-white group-hover:bg-[#FA5A15] group-hover:border-[#FA5A15] group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 shadow-md">
                  <ArrowRight className="w-4 h-4" strokeWidth={2.4} />
                </div>
              </div>
            </div>
          </div>

          {/* 2. РОЛЬ: СУПРОВІД */}
          <div className="card-hero-wrap">
            <div
              ref={secondaryRef}
              role="button"
              tabIndex={0}
              onMouseMove={onTilt(secondaryRef)}
              onMouseLeave={onTiltLeave(secondaryRef)}
              onPointerDown={onRipple(secondaryRef)}
              onClick={() => pick('supervisor')}
              onKeyDown={(e) => { 
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick('supervisor');
                }
              }}
              className="card-secondary spotlight group p-4 sm:p-5 cursor-pointer select-none overflow-hidden rounded-3xl bg-[#0A0E18]/70 border border-white/10 backdrop-blur-2xl shadow-lg hover:border-[#FA5A15]/40 hover:bg-[#0A0E18]/85 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FA5A15]"
              aria-label="Вхід для супроводу команди"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#FA5A15] to-[#D94500] flex items-center justify-center flex-shrink-0 shadow-md shadow-[#FA5A15]/25 group-hover:scale-105 group-hover:shadow-[0_0_18px_rgba(250,90,21,0.5)] transition-all duration-300">
                    <Award className="w-5 h-5 text-white" strokeWidth={2.4} />
                  </div>

                  <div className="min-w-0 pr-1">
                    <h2 className="text-sm sm:text-base font-bold text-slate-200 tracking-wide group-hover:text-white transition-colors">
                      Я супровід
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-400 leading-snug mt-0.5">
                      Керування командою, присутність та активності
                    </p>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 group-hover:text-[#FA5A15] group-hover:translate-x-1 transition-all duration-300 flex-shrink-0">
                  <ArrowRight className="w-4 h-4" strokeWidth={2.2} />
                </div>
              </div>
            </div>
          </div>

        </main>

        {/* Вхід для випускників минулих змін */}
        <button
          onClick={() => pick('alumni')}
          className="mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-[#FFB800]/25 bg-[#0A0E18]/60 backdrop-blur-2xl text-[11px] sm:text-xs font-bold text-[#FFB800] hover:border-[#FFB800]/50 hover:bg-[#0A0E18]/80 transition-all duration-300"
          aria-label="Вхід для випускника проєкту"
        >
          <Medal className="w-4 h-4" strokeWidth={2.2} />
          Я випускник (Відновити мій паспорт)
        </button>
      </div>

      {/* Лаконічний футер */}
      <footer className="relative z-10 w-full text-center py-2 text-[11px] sm:text-xs text-slate-500 font-medium select-none flex items-center justify-center gap-2">
        <span>Проєкт «Залізна Зміна»</span>
        <span className="text-slate-700">•</span>
        <span>Укрзалізниця</span>
      </footer>
    </div>
  );
};

export default RoleSelect;
