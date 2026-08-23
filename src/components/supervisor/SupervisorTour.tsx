import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHaptics } from '@/hooks/useHaptics';
import { cn } from '@/lib/utils';

export const tourStorageKey = (team: number) =>
  `helpsuprov:supervisor-tour-completed:team_${team}`;

interface TourStep {
  targetTab: string;
  selector: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    targetTab: 'teams',
    selector: '[data-tour="step-1-sort"]',
    title: 'Вітаємо у проєкті! 👋',
    text: 'Тут ти можеш швидко відфільтрувати список дітей своєї команди: за присутністю, балансом Айрон-доларів або наявністю нотаток.',
  },
  {
    targetTab: 'teams',
    selector: '[data-tour="step-2-my-team"]',
    title: 'Картка твоєї команди',
    text: 'Твоя команда виділена фірмовим градієнтом і бейджем «МОЯ». Тут видно загальну кількість дітей, присутніх та тих, хто вже увійшов у систему.',
  },
  {
    targetTab: 'teams',
    selector: '[data-tour="step-3-presence-toggle"]',
    title: 'Швидка присутність',
    text: 'Натискай чекбокс біля дитини для миттєвої фіксації присутності. Працює оптимістично навіть при нестабільному зв\'язку.',
  },
  {
    targetTab: 'teams',
    selector: '[data-tour="step-4-child-card"]',
    title: 'Профіль дитини',
    text: 'Клікни по рядку дитини, щоб відкрити редактор: нарахувати чи списати Айрон-долари та записати важливі нотатки супроводу (особливості, здоров\'я тощо).',
  },
  {
    targetTab: 'teams',
    selector: '[data-tour="step-5-bank-button"]',
    title: 'Банк Айрон-Доларів',
    text: 'Кнопка Wallet відкриває персональний рахунок супроводу. Встановлюй бюджет та видавай винагороди за активність на проєкті.',
  },
  {
    targetTab: 'transfers',
    selector: '[data-tour="step-6-transfers-root"]',
    title: 'Трансфери між командами',
    text: 'Потрібно перевести дитину в іншу команду чи зробити прямий обмін «ПІБ на ПІБ»? Використовуй цю вкладку.',
  },
  {
    targetTab: 'coupes',
    selector: '[data-tour="step-7-coupes-root"]',
    title: 'Розселення в потязі',
    text: 'Керуй розподілом місць по купе та ролями пасажирів (Учасник, Супровід, Спікер) для безпечної та організованої поїздки.',
  },
  {
    targetTab: 'notifications',
    selector: '[data-tour="step-8-notifications-root"]',
    title: 'Стрічка подій та вихід',
    text: 'Тут фіксуються всі важливі події (трансфери, зміни балансу). Для завершення сесії натискай «Вийти» у верхній панелі. Бажаємо успішної зміни на проєкті!',
  },
];

interface Props {
  open: boolean;
  teamNumber: number;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;
}

interface Rect { top: number; left: number; width: number; height: number; }

const PAD = 8;

const SupervisorTour = ({ open, teamNumber, activeTab, onTabChange, onClose }: Props) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const haptics = useHaptics();
  const cardRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (open) {
      setIndex(0);
      haptics.notification('success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock background scroll while touring
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Switch tab if the step lives elsewhere
  useEffect(() => {
    if (!open || !step) return;
    if (step.targetTab && step.targetTab !== activeTab) onTabChange(step.targetTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Find target (retry a few times while the tab DOM mounts) + smooth scroll
  useLayoutEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* ignore */ }
        setTimeout(() => { if (!cancelled) measure(); }, 400);
        return;
      }
      setRect(null);
      if (tries++ < 12) setTimeout(tick, 250);
    };
    const t = setTimeout(tick, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, index, step, measure]);

  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    const iv = setInterval(on, 500);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
      clearInterval(iv);
    };
  }, [open, measure]);

  const finish = useCallback(() => {
    localStorage.setItem(tourStorageKey(teamNumber), new Date().toISOString());
    haptics.notification('success');
    onClose();
  }, [teamNumber, haptics, onClose]);

  const next = () => {
    if (isLast) { finish(); return; }
    haptics.selection();
    setIndex((i) => i + 1);
  };
  const prev = () => {
    if (index === 0) return;
    haptics.selection();
    setIndex((i) => i - 1);
  };

  // Keyboard support (desktop)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  if (!open || !step) return null;

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // Place the card below the spotlight when there is room, otherwise above.
  const spotlightBottom = rect ? rect.top + rect.height + PAD : 0;
  const placeBelow = !rect ? true : spotlightBottom < vh * 0.52;

  const cardStyle: React.CSSProperties = rect
    ? placeBelow
      ? { top: Math.min(spotlightBottom + 12, vh - 40) }
      : { bottom: Math.min(vh - rect.top + PAD + 12, vh - 40) }
    : { top: '50%', transform: 'translateY(-50%)' };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Навчання супроводу"
      onClick={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.preventDefault()}
    >
      {/* Spotlight cut-out (giant box-shadow) */}
      {rect ? (
        <div
          className="absolute rounded-2xl border-2 border-primary pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] animate-pulse-glow"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.75), 0 0 24px 2px hsl(var(--primary) / 0.6)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/75 transition-opacity duration-300" />
      )}

      {/* Blocker: swallow all clicks outside the card */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Coach card */}
      <div
        ref={cardRef}
        className={cn(
          'absolute left-3 right-3 mx-auto max-w-md rounded-2xl border border-primary/30',
          'bg-card/95 backdrop-blur-xl shadow-2xl p-4 animate-fade-in',
          'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        )}
        style={{
          ...cardStyle,
          marginBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Крок {index + 1} з {TOUR_STEPS.length}
            </p>
            <h3 className="font-black text-base leading-tight mt-0.5">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="Пропустити навчання"
            className="p-2 -m-1 rounded-lg text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">{step.text}</p>

        {/* Progress */}
        <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-500"
            style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={prev}
            disabled={index === 0}
            className="h-11 px-3 flex-1 text-xs font-bold"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Назад
          </Button>
          <Button
            size="sm"
            onClick={next}
            className="h-11 px-3 flex-[1.4] text-xs font-bold uppercase bg-gradient-primary"
          >
            {isLast ? 'Завершити' : 'Далі'}
            {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>

        <button
          type="button"
          onClick={finish}
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
