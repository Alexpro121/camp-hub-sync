import { CalendarClock, Mountain, TrainFront, CheckCircle2, Sparkles, MapPin, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { CATEGORY_LABELS, pluralDays, type TeamShiftStatus } from '@/lib/shift-resolver';
import { cn } from '@/lib/utils';

interface PhaseStyleConfig {
  icon: typeof CalendarClock;
  border: string;
  bg: string;
  glow: string;
  badge: string;
  text: string;
  dot: string;
}

const PHASE_META: Record<string, PhaseStyleConfig> = {
  PREPARING: { 
    icon: CalendarClock, 
    border: 'border-[#FA5A15]/35',
    bg: 'bg-gradient-to-r from-[#FA5A15]/[0.08] via-card/85 to-card/85',
    glow: 'bg-[#FA5A15]/20',
    badge: 'bg-[#FA5A15]/15 text-[#FA5A15] border-[#FA5A15]/30',
    text: 'text-[#FA5A15]',
    dot: 'bg-[#FA5A15]'
  },
  TRAVEL_PHASE: { 
    icon: TrainFront, 
    border: 'border-amber-500/35',
    bg: 'bg-gradient-to-r from-amber-500/[0.08] via-card/85 to-card/85',
    glow: 'bg-amber-500/20',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    text: 'text-amber-400',
    dot: 'bg-amber-400'
  },
  JOINT_BUKOVEL_PHASE: { 
    icon: Mountain, 
    border: 'border-emerald-500/35',
    bg: 'bg-gradient-to-r from-emerald-500/[0.08] via-card/85 to-card/85',
    glow: 'bg-emerald-500/20',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400'
  },
  FINISHED: { 
    icon: CheckCircle2, 
    border: 'border-border/60',
    bg: 'bg-card/75',
    glow: 'bg-white/5',
    badge: 'bg-muted text-muted-foreground border-border',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground'
  },
};

interface Props {
  status: TeamShiftStatus;
  teamNumber?: number | null;
  compact?: boolean;
  className?: string;
}

/**
 * Відображає поточну фазу зміни команди з відліком до заїзду або статусом у Буковелі.
 */
const PhaseBanner = ({ status, teamNumber, compact, className }: Props) => {
  const meta = PHASE_META[status.currentPhase] ?? PHASE_META.FINISHED;
  const Icon = meta.icon;
  const arrival = status.hotelStartDate || status.startDate;
  const isPreparing = status.currentPhase === 'PREPARING';
  const isTravel = status.currentPhase === 'TRAVEL_PHASE';
  const isLiveCamp = status.currentPhase === 'JOINT_BUKOVEL_PHASE';

  // Компактний режим (для шапок та невеликих блоків)
  if (compact) {
    return (
      <div className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-md select-none transition-all shadow-sm',
        meta.bg,
        meta.border,
        className
      )}>
        <span className="relative flex h-2 w-2">
          {!status.currentPhase.includes('FINISHED') && (
            <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', meta.dot)} />
          )}
          <span className={cn('relative inline-flex rounded-full h-2 w-2', meta.dot)} />
        </span>

        <Icon className={cn('w-3.5 h-3.5 shrink-0', meta.text)} strokeWidth={2} />
        
        <span className="text-[11px] font-semibold text-foreground leading-none">
          {teamNumber ? `Команда №${teamNumber} · ` : ''}{CATEGORY_LABELS[status.category]}
        </span>
      </div>
    );
  }

  // Повний режим банера
  return (
    <Card className={cn(
      'p-4 sm:p-4.5 border rounded-2xl sm:rounded-3xl backdrop-blur-md relative overflow-hidden select-none transition-all shadow-sm',
      meta.bg,
      meta.border,
      className
    )}>
      {/* М'який фоновий ореол */}
      <div className={cn('absolute -left-10 -top-10 w-32 h-32 rounded-full blur-2xl pointer-events-none opacity-60', meta.glow)} />

      <div className="relative z-10 flex items-start gap-3.5">
        
        {/* Іконка фази */}
        <div className={cn(
          'w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl border flex items-center justify-center shrink-0 shadow-inner mt-0.5',
          meta.badge
        )}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>

        {/* Контент фази */}
        <div className="min-w-0 flex-1">
          
          {/* Верхній рядок: Команда та Категорія */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground truncate">
              {teamNumber ? `Команда №${teamNumber} · ` : ''}{CATEGORY_LABELS[status.category]}
            </p>

            {/* Живий індикатор */}
            {!status.currentPhase.includes('FINISHED') && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-1 border border-border/40 text-[9px] font-bold uppercase tracking-wider text-foreground/80 shrink-0">
                <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', meta.dot)} />
                {isPreparing ? 'Очікування' : isTravel ? 'У дорозі' : 'На локації'}
              </span>
            )}
          </div>

          {/* Назва поточної фази */}
          <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight leading-snug">
            {status.phaseTitle}
          </h3>

          {/* 1. ФАЗА ПІДГОТОВКИ: ВЕЛИКИЙ ВІДЛІК ДНІВ */}
          {isPreparing && (
            <div className="mt-2.5 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-1/60 border border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-[#FA5A15] shrink-0" />
                <div className="text-xs text-muted-foreground truncate">
                  Початок заїзду: <span className="font-bold text-foreground tabular-nums">{arrival}</span>
                </div>
              </div>

              <div className="px-2.5 py-1 rounded-lg bg-[#FA5A15]/15 border border-[#FA5A15]/30 text-[#FA5A15] text-xs font-black font-mono tracking-tight shrink-0 shadow-sm">
                {status.daysUntilStart} {pluralDays(status.daysUntilStart)}
              </div>
            </div>
          )}

          {/* 2. ФАЗА ПОДОРОЖІ У ПОТЯЗІ */}
          {isTravel && (
            <div className="mt-2.5 flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
              <TrainFront className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <span>Рейс прямує в Карпати. Прибуття в Буковель: </span>
                <strong className="text-white font-mono">{arrival}</strong>
              </div>
            </div>
          )}

          {/* 3. АКТИВНИЙ ТАБІР У БУКОВЕЛІ */}
          {isLiveCamp && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Буковель Hub · Дати зміни: </span>
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {status.startDate} → {status.endDate}
              </span>
            </div>
          )}

          {/* 4. ЗАВЕРШЕНА ЗМІНА */}
          {status.currentPhase === 'FINISHED' && (
            <p className="text-xs text-muted-foreground mt-1.5 font-mono tabular-nums">
              Дати заїзду: {status.startDate} → {status.endDate}
            </p>
          )}

        </div>
      </div>
    </Card>
  );
};

export default PhaseBanner;
