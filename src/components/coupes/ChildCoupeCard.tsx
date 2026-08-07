import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight, Check, Loader2, MapPin, Train, User, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import TripSelector from '@/components/coupes/TripSelector';
import ChildSwapDialog, { type SwapRow } from '@/components/coupes/ChildSwapDialog';
import { useTrainSettings } from '@/hooks/useTrainSettings';
import { useSwapRequests } from '@/hooks/useSwapRequests';
import { tripShort } from '@/lib/trips';

interface Row extends SwapRow {
  boarding_city: string | null;
  trip_number: number;
}

/** "Твоє купе в потязі" — coupe, neighbours, trips and optional seat swapping. */
const ChildCoupeCard = ({ childId, teamNumber }: { childId: string; teamNumber: number }) => {
  const { settings } = useTrainSettings();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(1);
  const [swapOpen, setSwapOpen] = useState(false);
  const { incoming, respond, busy } = useSwapRequests(childId, settings.autoApprove);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('train_coupes')
      .select('id, coupe_number, seat_number, passenger_name, boarding_city, child_id, is_staff, trip_number')
      .order('seat_number');
    setRows((data || []) as unknown as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`child-coupes-${childId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'train_coupes' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [childId, load]);

  if (loading || !rows.length) return null;

  const counts = rows.reduce<Record<number, number>>((acc, r) => {
    acc[r.trip_number] = (acc[r.trip_number] ?? 0) + 1;
    return acc;
  }, {});
  const tripRows = rows.filter((r) => r.trip_number === trip);
  const mine = tripRows.find((r) => r.child_id === childId);
  const hasAnyTrip = Object.keys(counts).length > 1;

  // Service coupes (staff, speakers, guests) are hidden from children entirely.
  const neighbours = mine
    ? tripRows.filter((r) => r.coupe_number === mine.coupe_number && r.id !== mine.id && r.is_staff !== true && !!r.child_id)
    : [];

  return (
    <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50">
      <div className="flex items-center gap-2 mb-3">
        <Train className="w-4 h-4 text-primary" strokeWidth={1.75} />
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Твоє купе в потязі
        </p>
      </div>

      {hasAnyTrip && (
        <div className="mb-3">
          <TripSelector value={trip} onChange={setTrip} counts={counts} />
        </div>
      )}

      {incoming.length > 0 && (
        <div className="mb-3 space-y-2">
          {incoming.map((r) => (
            <div key={r.id} className="rounded-xl border border-primary/40 bg-primary/10 p-3 space-y-2">
              <p className="text-sm leading-snug break-words">
                <span className="font-medium">{r.requester?.full_name ?? 'Хтось'}</span> пропонує помінятися купе
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" className="h-9 text-xs" disabled={busy === r.id} onClick={() => respond(r.id, true)}>
                  {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" /> Прийняти</>}
                </Button>
                <Button size="sm" variant="secondary" className="h-9 text-xs" disabled={busy === r.id} onClick={() => respond(r.id, false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Відхилити
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!mine ? (
        <p className="text-sm text-muted-foreground">Для «{tripShort(trip)}» місце ще не призначене</p>
      ) : (
      <>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums leading-none">№{mine.coupe_number}</span>
        <span className="text-xs text-muted-foreground">купе</span>
      </div>

      {mine.boarding_city && (
        <Badge variant="outline" className="mt-3 gap-1 text-[11px]">
          <MapPin className="w-3 h-3" strokeWidth={2} />
          Підсадка у м. {mine.boarding_city}
        </Badge>
      )}

      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-4 mb-2">
        Твої сусіди по купе
      </p>
      {neighbours.length ? (
        <div className="space-y-1.5">
          {neighbours.map((n) => (
            <div key={n.id} className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <span className="text-sm flex-1 min-w-0 break-words">{n.passenger_name}</span>
              {n.is_staff && <Badge variant="secondary" className="text-[9px] shrink-0">Супровід</Badge>}
              {n.boarding_city && (
                <Badge variant="outline" className="text-[9px] gap-1 shrink-0">
                  <MapPin className="w-2.5 h-2.5" strokeWidth={2} />{n.boarding_city}
                </Badge>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Поки ти єдиний у цьому купе</p>
      )}

      {settings.allowSwaps && (
        <>
          <Button variant="secondary" className="w-full h-11 mt-3" onClick={() => setSwapOpen(true)}>
            <ArrowLeftRight className="w-4 h-4 mr-2" /> Хочу помінятися купе
          </Button>
          <ChildSwapDialog
            open={swapOpen}
            onOpenChange={setSwapOpen}
            childId={childId}
            teamNumber={teamNumber}
            tripNumber={trip}
            shiftId={settings.shiftId}
            rows={tripRows}
            autoApprove={settings.autoApprove}
            onDone={load}
          />
        </>
      )}
      </>
      )}
    </Card>
  );
};

export default ChildCoupeCard;