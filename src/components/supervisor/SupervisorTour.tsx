import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHaptics } from '@/hooks/useHaptics';

export const tourStorageKey = (team: number) =>
  `helpsuprov:supervisor-tour-completed:team_${team}`;

interface TourStep {
  targetTab: string;
  selector: string;
  title: string;
  text: string;
  /** Extra delay (ms) before searching for the target — dialogs need mount time. */
  delay?: number;
  onEnter?: () => void;
  onLeave?: () => void;
}

interface Props {
  open: boolean;
  teamNumber: number;
  myTeam: number;
  activeTab: string;
  firstTeamChild: unknown | null;
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
  activeTab,
  firstTeamChild,
  onTabChange,
  setOpenTeam,
  setEditChild,
  setBankOpen,
  onClose,
}: Props) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardSize, setCardSize] = useState({ w: 320, h: 240 });
  const cardRef = useRef<HTMLDivElement>(null);
  const haptics = useHaptics();

  const cleanup = useCallback(() => {
    setEditChild(null);
    setBankOpen(false);
  }, [setEditChild, setBankOpen]);

  const steps: TourStep[] = useMemo(() => [
    {
      targetTab: 'teams',
      selector: '[data-tour="step-1-sort"]',
      title: 'Вітаємо у проєкті! 👋',
      text: 'Тут ти можеш відфільтрувати дітей своєї команди: за присутністю, балансом Айрон-доларів або наявністю нотаток.',
      onEnter: () => { onTabChange('teams'); setOpenTeam(null); setEditChild(null); setBankOpen(false); },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-2-my-team"]',
      title: 'Твоя команда',
      text: 'Картка команди має бейдж «МОЯ». Натисни на неї (або ми вже розкрили її для тебе), щоб побачити список усіх дітей.',
      onEnter: () => { onTabChange('teams'); setOpenTeam(myTeam); },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-3-presence-toggle"]',
      title: 'Швидка присутність',
      text: 'Натискай цей чекбокс для швидкої відмітки присутності. Працює миттєво та оптимістично навіть офлайн.',
      onEnter: () => { onTabChange('teams'); setOpenTeam(myTeam); },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-4-iron-adjustment"]',
      title: 'Айрон-Долари дитини',
      text: 'У профілі дитини ти можеш швидко нарахувати або списати валюту кнопками плюс/мінус за активність на проєкті.',
      delay: 300,
      onEnter: () => { setOpenTeam(myTeam); if (firstTeamChild) setEditChild(firstTeamChild); },
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-4-notes"]',
      title: 'Нотатки супроводу',
      text: 'Записуй сюди важливі спостереження (здоров\'я, таланти, поведінка). Нотатки бачить лише супровід та адміністрація.',
      delay: 200,
      onEnter: () => { if (firstTeamChild) setEditChild(firstTeamChild); },
      onLeave: () => setEditChild(null),
    },
    {
      targetTab: 'teams',
      selector: '[data-tour="step-5-bank-balance"]',
      title: 'Банк Айрон-Доларів',
      text: 'Це твій персональний баланс команди. Встановлюй ліміт бюджету та зручно контролюй, скільки коштів уже роздано дітям.',
      delay: 300,
      onEnter: () => { setEditChild(null); setBankOpen(true); },
      onLeave: () => setBankOpen(false),
    },
    {
      targetTab: 'transfers',
      selector: '[data-tour="step-6-transfers-root"]',
      title: 'Трансфери між командами',
      text: 'Потрібно перевести дитину в іншу команду або зробити рівноцінний обмін «дитина на дитину»? Усе робиться тут.',
      onEnter: () => { setBankOpen(false); setEditChild(null); onTabChange('transfers'); },
    },
    {
      targetTab: 'coupes',
      selector: '[data-tour="step-7-coupes-root"]',
      title: 'Розселення по купе',
      text: 'Керуй розміщенням пасажирів у потязі, вказуй ролі (Учасник, Супровід, Спікер) та контролюй посадку.',
      onEnter: () => onTabChange('coupes'),
    },
    {
      targetTab: 'notifications',
      selector: '[data-tour="step-8-notifications-root"]',
      title: 'Стрічка подій та вихід',
      text: 'Тут з\'являються всі сповіщення проєкту. Коли завершиш зміну — натискай «Вийти». Бажаємо крутого проєкту!',
      onEnter: () => onTabChange('notifications'),
    },
  ], [myTeam, firstTeamChild, onTabChange, setOpenTeam, setEditChild, setBankOpen]);

  const total = steps.length;
  const step = steps[index];
  const isLast = index === total - 1;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    haptics.notification('success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Run the step's onEnter whenever it becomes current
  useEffect(() => {
    if (!open || !step) return;
    step.onEnter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  // Locate target (retry while tab/dialog DOM mounts) + smooth scroll into view
  useLayoutEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* noop */ }
        setTimeout(() => { if (!cancelled) measure(); }, 380);
        return;
      }
      setRect(null);
      if (tries++ < 16) setTimeout(tick, 200);
    };
    const t = setTimeout(tick, (step.delay ?? 0) + 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, index, step, measure]);

  // Keep the spotlight glued to the target
  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    const iv = setInterval(on, 400);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
      clearInterval(iv);
    };
  }, [open, measure]);

  // Track the tooltip's own size for accurate clamping
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
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  const goTo = (next: number) => {
    if (next === index) return;
    steps[index]?.onLeave?.();
    haptics.selection();
    setRect(null);
    setIndex(next);
  };

  const next = () => {
    if (isLast) { steps[index]?.onLeave?.(); finish(); return; }
    goTo(index + 1);
  };
  const prev = () => { if (index > 0) goTo(index - 1); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); skip(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  if (!open || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipWidth = Math.min(vw - PADDING * 2, 360);

  // ---- Horizontal clamp -------------------------------------------------
  let left = rect
    ? rect.left + (rect.width - tooltipWidth) / 2
    : (vw - tooltipWidth) / 2;
  left = Math.max(PADDING, Math.min(vw - tooltipWidth - PADDING, left));

  // ---- Vertical placement ----------------------------------------------
  const cardH = cardSize.h || 240;
  const spaceBelow = rect ? vh - (rect.bottom + SPOT_PAD) : vh;
  const spaceAbove = rect ? rect.top - SPOT_PAD : vh;
  // Elements that dominate the screen (open dialogs) -> pin to the bottom third.
  const isHuge = rect ? rect.height > vh * 0.55 : false;

  let topStyle: number | undefined;
  let bottomStyle: string | undefined;

  if (!rect || isHuge) {
    bottomStyle = 'calc(16px + env(safe-area-inset-bottom))';
  } else if (spaceBelow >= Math.max(200, cardH + 24)) {
    topStyle = rect.bottom + SPOT_PAD + 12;
  } else if (spaceAbove >= cardH + 24) {
    topStyle = rect.top - SPOT_PAD - 12 - cardH;
  } else {
    // Nothing fits cleanly — dock to whichever side has more room.
    if (spaceBelow >= spaceAbove) bottomStyle = 'calc(16px + env(safe-area-inset-bottom))';
    else topStyle = PADDING;
  }

  if (topStyle !== undefined) {
    topStyle = Math.max(PADDING, Math.min(vh - cardH - PADDING, topStyle));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Навчання супроводу"
    >
      {/* Dim + spotlight cut-out */}
      {rect ? (
        <div
          className="absolute rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] animate-pulse"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.75), 0 0 26px 2px hsl(var(--primary) / 0.55)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/75 transition-opacity duration-300" />
      )}

      {/* Click blocker: nothing outside the coach card is interactive */}
      <div
        className="absolute inset-0"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.preventDefault()}
      />

      {/* Coach card */}
      <div
        ref={cardRef}
        className="absolute rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl shadow-2xl p-4 animate-fade-in transition-[top,bottom,left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          width: tooltipWidth,
          left,
          ...(topStyle !== undefined ? { top: topStyle } : {}),
          ...(bottomStyle !== undefined ? { bottom: bottomStyle } : {}),
          maxHeight: `calc(100dvh - ${PADDING * 2}px)`,
          overflowY: 'auto',
        }}
      >
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Крок {index + 1} з {total}
            </p>
            <h3 className="font-black text-base leading-tight mt-0.5">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={skip}
            aria-label="Пропустити навчання"
            className="w-9 h-9 -mt-1 -mr-1 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">{step.text}</p>

        <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-500"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          {index > 0 && (
            <Button variant="ghost" onClick={prev} className="h-11 px-3 flex-1 text-xs font-bold">
              <ChevronLeft className="w-4 h-4 mr-1" /> Назад
            </Button>
          )}
          <Button
            onClick={next}
            className="h-11 px-3 flex-[1.6] text-xs font-bold uppercase bg-gradient-primary"
          >
            {isLast ? 'Завершити' : 'Далі'}
            {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>

        <button
          type="button"
          onClick={skip}
          className="mt-2 w-full text-[11px] text-muted-foreground hover:text-foreground py-2 transition-colors"
        >
          Пропустити навчання
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default SupervisorTour;
