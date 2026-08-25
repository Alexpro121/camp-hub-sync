import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Coins, 
  Calendar, 
  ShoppingBag, 
  Users, 
  Train, 
  Bell, 
  ShieldCheck,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TRAIN_FEATURE_ENABLED } from '@/lib/trips';
import { useHaptics } from '@/hooks/useHaptics';

export const tourStorageKey = (team: number) =>
  `helpsuprov:supervisor-tour-completed:team_${team}`;

interface TourStep {
  targetTab: string;
  selector: string;
  fallbackSelector?: string;
  title: string;
  text: string;
  icon?: React.ComponentType<{ className?: string }>;
  delay?: number;
  onEnter?: () => void;
  onLeave?: () => void;
}

interface Props {
  open: boolean;
  teamNumber: number;
  myTeam: number;
  activeTab: string;
  firstTeamChild: any | null;
  onTabChange: (tab: string) => void;
  setOpenTeam: (team: number | null) => void;
  setEditChild: (child: any | null) => void;
  setBankOpen: (open: boolean) => void;
  onClose: () => void;
}

const PADDING = 16;
const SPOT_PAD = 8;

const SupervisorTour = ({
  open,
  teamNumber,
  myTeam,
  firstTeamChild,
  onTabChange,
  setOpenTeam,
  setEditChild,
  setBankOpen,
  onClose,
}: Props) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const [cardSize, setCardSize] = useState({ w: 340, h: 240 });
  const cardRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(false);
  const haptics = useHaptics();

  // Демонстраційний учасник для стабільного проходження туру
  const fallbackChild = useMemo(() => ({
    id: 'tour-mock-child-preview',
    full_name: 'Остапенко Максим',
    team_number: myTeam,
    iron_dollars: 150,
    is_present: true,
    row_number: 1,
    team_name: 'Збірна',
    notes: 'Активний учасник проєкту',
  }), [myTeam]);

  const activeChild = firstTeamChild || fallbackChild;

  const cleanup = useCallback(() => {
    setEditChild(null);
    setBankOpen(false);
  }, [setEditChild, setBankOpen]);

  // 11 вивірених кроків навчання
  const steps: TourStep[] = useMemo(() => [
    {
      targetTab: 'teams',
      selector: '[data-tour="step-1-sort"]',
      title: 'Вітаємо у проєкті! 👋',
      text: 'Це твій робочий простір. Тут можна шукати учасників своєї команди, сортувати за присутністю, балансом А$ або наявністю нотаток.',
      icon: Users,
      onEnter: () => { 
        onTabChange('teams'); 
        setEditChild(null); 
        setBankOpen(false); 
      },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-2-my-team"]',
      title: 'Твоя команда',
      text: 'Картка твоєї команди має бейдж «МОЯ». Натисни на неї, щоб розкрити або переглянути повний список учасників.',
      icon: Users,
      onEnter: () => { 
        onTabChange('teams'); 
        setOpenTeam(myTeam); 
      },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-3-presence-toggle"]',
      fallbackSelector: '[data-tour="step-2-my-team"]',
      title: 'Швидка присутність',
      text: 'Відмічай присутність учасників в 1 дотик. Працює миттєво та оптимістично навіть без стабільного інтернету.',
      icon: Check,
      delay: 150,
      onEnter: () => { 
        onTabChange('teams'); 
        setOpenTeam(myTeam); 
      },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-4-iron-adjustment"]',
      fallbackSelector: '[data-tour="step-2-my-team"]',
      title: 'Айрон-долари (А$)',
      text: 'Нараховуй та списуй валюту проєкту А$ за активність, командні перемоги та участь у подіях.',
      icon: Coins,
      delay: 250,
      onEnter: () => { 
        onTabChange('teams');
        setOpenTeam(myTeam); 
        setEditChild(activeChild); 
      },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-4-notes"]',
      fallbackSelector: '[data-tour="step-4-iron-adjustment"]',
      title: 'Нотатки супроводу',
      text: 'Фіксуй важливі спостереження (здоров\'я, таланти, особливості). Нотатки конфіденційні — їх бачить лише супровід та штаб.',
      icon: ShieldCheck,
      delay: 200,
      onEnter: () => { 
        setEditChild(activeChild); 
      },
      onLeave: () => setEditChild(null),
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-5-bank-balance"]',
      fallbackSelector: '[data-tour="step-5-bank-button"]',
      title: 'Банк Айрон-доларів',
      text: 'Твій командний фонд А$. Контролюй ліміт бюджету та переглядай, скільки коштів уже нараховано команді.',
      icon: Coins,
      delay: 250,
      onEnter: () => { 
        setEditChild(null); 
        setBankOpen(true); 
      },
      onLeave: () => setBankOpen(false),
    },
    {
      targetTab: 'fair',
      selector: '[data-tour="step-fair-terminal"]',
      title: 'Термінал каси Air Pay',
      text: '100% безконтактна оплата ярмарку по повітрю! Коли учасник надсилає запит на твою касу — списуй кошти в 1 клік.',
      icon: ShoppingBag,
      onEnter: () => { 
        setBankOpen(false); 
        setEditChild(null); 
        onTabChange('fair'); 
      },
    },
    {
      targetTab: 'schedule',
      selector: '[data-tour="step-schedule-timeline"]',
      title: 'Розклад подій дня',
      text: 'Хронологічний розклад зміни, перемикач дат, фільтр команд та таймер зворотного відліку до наступної активності.',
      icon: Calendar,
      onEnter: () => { 
        onTabChange('schedule'); 
      },
    },
    {
      targetTab: 'transfers',
      selector: '[data-tour="step-6-transfers-root"]',
      title: 'Трансфери між командами',
      text: 'Зручне переведення учасників між командами або рівноцінний обмін «учасник на учасника» без плутанини.',
      icon: Users,
      onEnter: () => { 
        onTabChange('transfers'); 
      },
    },
    ...(TRAIN_FEATURE_ENABLED ? [{
      targetTab: 'coupes',
      selector: '[data-tour="step-7-coupes-root"]',
      title: 'Купе в потязі УЗ',
      text: 'Контролюй розсадження команди у вагоні, перевіряй номери місць та позначай посадку учасників.',
      icon: Train,
      onEnter: () => onTabChange('coupes'),
    }] : []),
    {
      targetTab: 'notifications',
      selector: '[data-tour="step-8-notifications-root"]',
      title: 'Стрічка сповіщень',
      text: 'Усі оголошення штабу проєкту з\'являються тут. За потреби ти завжди можеш пройти це навчання ще раз. Бажаємо крутого проєкту!',
      icon: Bell,
      onEnter: () => onTabChange('notifications'),
    },
  ], [myTeam, activeChild, onTabChange, setOpenTeam, setEditChild, setBankOpen]);

  const total = steps.length;
  const step = steps[index];
  const isLast = index === total - 1;

  // ✅ ВИПРАВЛЕНО: Скидання на крок 0 ТІЛЬКИ при реальному відкритті модалки
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setIndex(0);
      steps[0]?.onEnter?.();
      haptics.notification('success');
    }
    prevOpenRef.current = open;
  }, [open, steps, haptics]);

  useEffect(() => {
    if (!open) return;
    document.body.setAttribute('data-tour-active', 'true');
    return () => { document.body.removeAttribute('data-tour-active'); };
  }, [open]);

  const measure = useCallback(() => {
    if (!step) return;
    let el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el && step.fallbackSelector) {
      el = document.querySelector(step.fallbackSelector) as HTMLElement | null;
    }
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect((prev) => {
      if (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5
        && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5) return prev;
      return r;
    });
  }, [step]);

  // Безпечний пошук цільового елемента без лагів
  useLayoutEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    let tries = 0;
    setReady(false);

    const tick = () => {
      if (cancelled) return;
      let el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el && step.fallbackSelector) {
        el = document.querySelector(step.fallbackSelector) as HTMLElement | null;
      }

      if (el) {
        try { 
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); 
        } catch { /* noop */ }
        
        setTimeout(() => {
          if (cancelled) return;
          requestAnimationFrame(() => {
            if (cancelled) return;
            measure();
            setReady(true);
          });
        }, 220);
        return;
      }
      if (tries++ < 25) setTimeout(tick, 120);
    };

    const t = setTimeout(() => requestAnimationFrame(tick), (step.delay ?? 0) + 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, index, step, measure]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    const iv = setInterval(on, 350);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
      clearInterval(iv);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const el = cardRef.current;
    if (!el) return;
    const update = () => setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, index]);

  const finish = useCallback(() => {
    localStorage.setItem(tourStorageKey(teamNumber), new Date().toISOString());
    cleanup();
    haptics.notification('success');
    onClose();
  }, [teamNumber, cleanup, haptics, onClose]);

  const skip = useCallback(() => {
    haptics.impact('light');
    cleanup();
    onClose();
  }, [cleanup, onClose, haptics]);

  // ✅ ВИПРАВЛЕНО: Синхронний перехід між кроками з виконанням onLeave/onEnter
  const goTo = (nextIdx: number) => {
    if (nextIdx < 0 || nextIdx >= total || nextIdx === index) return;
    
    steps[index]?.onLeave?.();
    haptics.selection();
    
    // Запускаємо onEnter наступного кроку до зміни індексу
    steps[nextIdx]?.onEnter?.();
    setIndex(nextIdx);
  };

  const next = () => {
    if (isLast) { 
      steps[index]?.onLeave?.(); 
      finish(); 
      return; 
    }
    goTo(index + 1);
  };

  const prev = () => { 
    if (index > 0) goTo(index - 1); 
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); skip(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipWidth = Math.min(vw - PADDING * 2, 360);

  // Горизонтальне позиціонування
  let left = rect
    ? rect.left + (rect.width - tooltipWidth) / 2
    : (vw - tooltipWidth) / 2;
  left = Math.max(PADDING, Math.min(vw - tooltipWidth - PADDING, left));

  // Вертикальне позиціонування
  const cardH = cardSize.h || 240;
  const spaceBelow = rect ? vh - (rect.bottom + SPOT_PAD) : vh;
  const spaceAbove = rect ? rect.top - SPOT_PAD : vh;
  const isHuge = rect ? rect.height > vh * 0.55 : false;

  let topStyle: number;
  if (!rect || isHuge) {
    topStyle = vh - cardH - 24;
  } else if (spaceBelow >= Math.max(180, cardH + 20)) {
    topStyle = rect.bottom + SPOT_PAD + 12;
  } else if (spaceAbove >= cardH + 20) {
    topStyle = rect.top - SPOT_PAD - 12 - cardH;
  } else {
    topStyle = spaceBelow >= spaceAbove ? vh - cardH - 24 : PADDING;
  }
  topStyle = Math.max(PADDING, Math.min(vh - cardH - PADDING, topStyle));

  // Spotlight розміри
  const spotW = rect ? rect.width + SPOT_PAD * 2 : 0;
  const spotH = rect ? rect.height + SPOT_PAD * 2 : 0;
  const spotX = rect ? rect.left - SPOT_PAD : vw / 2;
  const spotY = rect ? rect.top - SPOT_PAD : vh / 2;

  const StepIcon = step.icon || Sparkles;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] select-none animate-fade-in"
      style={{ pointerEvents: 'auto', animationDuration: '220ms' }}
      role="dialog"
      aria-modal="true"
      aria-label="Інтерактивне навчання супроводу"
    >
      {/* Пружинний прожектор Spotlight */}
      <div
        className="tour-spotlight absolute top-0 left-0 rounded-2xl pointer-events-none transform-gpu will-change-transform"
        style={{
          width: spotW,
          height: spotH,
          transform: `translate3d(${spotX}px, ${spotY}px, 0)`,
          boxShadow: '0 0 0 9999px rgba(5, 7, 13, 0.82), 0 0 0 3px #FA5A15, 0 0 32px rgba(250, 90, 21, 0.45)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), width 0.35s ease, height 0.35s ease',
        }}
      />

      {/* Блокувальник кліків */}
      <div
        className="absolute inset-0"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Картка підказки */}
      <div
        ref={cardRef}
        className="tour-card absolute top-0 left-0 rounded-3xl border border-white/15 bg-[#0A0E18]/95 text-slate-100 backdrop-blur-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] p-4 sm:p-5 transform-gpu will-change-transform"
        style={{
          width: tooltipWidth,
          transform: `translate3d(${left}px, ${topStyle}px, 0)`,
          opacity: ready || !rect ? 1 : 0.88,
          maxHeight: `calc(100dvh - ${PADDING * 2}px)`,
          overflowY: 'auto',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease',
        }}
      >
        <div key={index} className="space-y-3">
          {/* Заголовок та крок */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shrink-0">
              <StepIcon className="w-5 h-5 text-[#FA5A15]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase font-mono font-bold tracking-widest text-[#FA5A15]">
                Крок {index + 1} з {total}
              </p>
              <h3 className="font-bold text-base text-white leading-tight mt-0.5">
                {step.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={skip}
              aria-label="Пропустити навчання"
              className="w-8 h-8 -mt-1 -mr-1 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Текст */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {step.text}
          </p>

          {/* Прогрес */}
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden ring-1 ring-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FA5A15] to-[#FF7D3B] transition-all duration-300 shadow-[0_0_12px_rgba(250,90,21,0.6)]"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>

          {/* Кнопки дій */}
          <div className="flex items-center gap-2 pt-1">
            {index > 0 && (
              <Button 
                variant="ghost" 
                onClick={prev} 
                className="h-11 px-3 flex-1 text-xs font-bold rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                <span>Назад</span>
              </Button>
            )}
            <Button
              onClick={next}
              className="h-11 px-4 flex-[1.6] text-xs font-bold uppercase rounded-xl bg-[#FA5A15] hover:bg-[#FF7D3B] text-white shadow-md active:scale-95 transition-all"
            >
              <span>{isLast ? 'Завершити' : 'Далі'}</span>
              {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>

          <button
            type="button"
            onClick={skip}
            className="w-full text-[11px] font-medium text-slate-500 hover:text-slate-300 py-1 transition-colors text-center"
          >
            Пропустити навчання
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SupervisorTour;
