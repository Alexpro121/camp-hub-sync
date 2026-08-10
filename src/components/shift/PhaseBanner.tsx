import { CalendarClock, Mountain, TrainFront, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { CATEGORY_LABELS, pluralDays, type TeamShiftStatus } from '@/lib/shift-resolver';

const PHASE_META = {
  PREPARING: { icon: CalendarClock, cls: 'bg-primary/15 text-primary border-primary/30' },
  TRAVEL_PHASE: { icon: TrainFront, cls: 'bg-warning/15 text-warning border-warning/30' },
  JOINT_BUKOVEL_PHASE: { icon: Mountain, cls: 'bg-success/15 text-success border-success/30' },
  FINISHED: { icon: CheckCircle2, cls: 'bg-muted text-muted-foreground border-border' },
} as const;

interface Props {
  status: TeamShiftStatus;
  teamNumber?: number | null;
  compact?: boolean;
}

/** Shows the current shift phase for a team (and a countdown before the arrival). */
const PhaseBanner = ({ status, teamNumber, compact }: Props) => {
  const meta = PHASE_META[status.currentPhase];
  const Icon = meta.icon;
  const arrival = status.hotelStartDate || status.startDate;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 ${meta.cls}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.9} />
        <span className="text-[11px] font-medium leading-tight">
          {CATEGORY_LABELS[status.category]} · {status.phaseTitle}
        </span>
      </div>
    );
  }

  return (
    <Card className={`p-4 border ${meta.cls} bg-card/80 backdrop-blur-md`}>
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] opacity-80">
            {teamNumber ? `Команда №${teamNumber} · ` : ''}{CATEGORY_LABELS[status.category]}
          </p>
          <p className="text-sm font-semibold mt-0.5 break-words">{status.phaseTitle}</p>
          {status.currentPhase === 'PREPARING' ? (
            <p className="text-xs mt-1 opacity-90">
              Твій заїзд розпочнеться <span className="font-bold tabular-nums">{arrival}</span>. Залишилося{' '}
              <span className="font-bold tabular-nums">
                {status.daysUntilStart} {pluralDays(status.daysUntilStart)}
              </span>!
            </p>
          ) : (
            <p className="text-xs mt-1 opacity-80 tabular-nums">
              {status.startDate} → {status.endDate}
              {status.hotelStartDate && status.hotelStartDate !== status.startDate
                ? ` · Буковель з ${status.hotelStartDate}`
                : ''}
            </p>
          )}
          {status.currentPhase === 'TRAVEL_PHASE' && (
            <p className="text-xs mt-1 opacity-90 tabular-nums">Приїзд у Буковель: {arrival}</p>
          )}
        </div>
      </div>
    </Card>
  );
};

export default PhaseBanner;