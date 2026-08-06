import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Train, User } from 'lucide-react';

export interface CoupeRow {
  id?: string;
  coupe_number: number;
  passenger_name: string;
  boarding_city: string | null;
  is_staff?: boolean | null;
  child_id?: string | null;
  seat_number?: number | null;
}

/** One coupe with its passengers. Seat numbers and berth types are never shown. */
const CoupeCard = ({
  coupeNumber,
  passengers,
  highlightId,
}: {
  coupeNumber: number;
  passengers: CoupeRow[];
  highlightId?: string | null;
}) => (
  <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50">
    <div className="flex items-center gap-2 mb-3">
      <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <Train className="w-4 h-4 text-primary" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground leading-none">Купе</p>
        <p className="text-xl font-semibold leading-tight tabular-nums">№{coupeNumber}</p>
      </div>
      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
        {passengers.length} / 4
      </span>
    </div>

    <div className="space-y-1.5">
      {passengers.map((p, i) => {
        const me = !!highlightId && p.child_id === highlightId;
        return (
          <div
            key={p.id ?? `${p.passenger_name}-${i}`}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 border ${
              me ? 'border-primary/50 bg-primary/10' : 'border-border/40 bg-muted/30'
            }`}
          >
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <span className="text-sm break-words flex-1 min-w-0">{p.passenger_name}</span>
            {p.is_staff && (
              <Badge variant="secondary" className="text-[9px] shrink-0">Супровід</Badge>
            )}
            {p.boarding_city && (
              <Badge variant="outline" className="text-[9px] gap-1 shrink-0">
                <MapPin className="w-2.5 h-2.5" strokeWidth={2} />
                {p.boarding_city}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  </Card>
);

export default CoupeCard;