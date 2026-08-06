import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, Train } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { groupByCoupe } from '@/lib/coupes';
import CoupeCard, { type CoupeRow } from './CoupeCard';

/** Train disposition for one team — coupes and neighbours only, no seat numbers. */
const TeamCoupesView = ({ myTeam }: { myTeam: number | null }) => {
  const [rows, setRows] = useState<CoupeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const q = supabase.from('train_coupes').select('*').order('coupe_number');
      const { data } = myTeam !== null ? await q.eq('team_number', myTeam) : await q;
      if (!alive) return;
      setRows((data || []) as unknown as CoupeRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [myTeam]);

  if (loading) {
    return <Card className="p-8 text-center bg-card/60"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></Card>;
  }

  if (!rows.length) {
    return (
      <Card className="p-8 text-center bg-card/60 border-dashed">
        <Train className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Розселення в потязі ще не завантажено</p>
      </Card>
    );
  }

  const coupes = groupByCoupe(rows);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground px-1">
        {rows.length} пасажирів · {coupes.length} купе
      </p>
      {coupes.map((c) => (
        <CoupeCard key={c.coupe_number} coupeNumber={c.coupe_number} passengers={c.passengers} />
      ))}
    </div>
  );
};

export default TeamCoupesView;