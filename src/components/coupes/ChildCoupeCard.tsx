import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Train, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Row {
  id: string;
  coupe_number: number;
  passenger_name: string;
  boarding_city: string | null;
  child_id: string | null;
  is_staff: boolean | null;
}

/** "Твоє купе в потязі" — coupe number, neighbours and boarding city only. */
const ChildCoupeCard = ({ childId }: { childId: string }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('train_coupes')
        .select('id, coupe_number, passenger_name, boarding_city, child_id, is_staff')
        .order('seat_number');
      if (!alive) return;
      setRows((data || []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [childId]);

  if (loading || !rows.length) return null;

  const mine = rows.find((r) => r.child_id === childId);
  if (!mine) return null;

  const neighbours = rows.filter((r) => r.coupe_number === mine.coupe_number && r.id !== mine.id);

  return (
    <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50">
      <div className="flex items-center gap-2 mb-3">
        <Train className="w-4 h-4 text-primary" strokeWidth={1.75} />
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Твоє купе в потязі
        </p>
      </div>

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
    </Card>
  );
};

export default ChildCoupeCard;