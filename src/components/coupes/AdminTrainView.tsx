import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronRight, Loader2, Train, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import CoupeManager from '@/components/coupes/CoupeManager';

type Stat = { team_number: number; passengers: number; coupes: number };

/** Admin train allocation grouped by team, each team editable in its own dialog. */
const AdminTrainView = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTeam, setOpenTeam] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('train_coupes').select('team_number, coupe_number');
    const map = new Map<number, Set<number>>();
    const counts = new Map<number, number>();
    (data || []).forEach((r: any) => {
      counts.set(r.team_number, (counts.get(r.team_number) || 0) + 1);
      if (!map.has(r.team_number)) map.set(r.team_number, new Set());
      map.get(r.team_number)!.add(r.coupe_number);
    });
    setStats(
      [...counts.entries()]
        .map(([team_number, passengers]) => ({ team_number, passengers, coupes: map.get(team_number)?.size ?? 0 }))
        .sort((a, b) => a.team_number - b.team_number),
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) {
    return <Card className="p-8 text-center bg-card/60"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></Card>;
  }

  if (!stats.length) {
    return (
      <Card className="p-8 text-center bg-card/60 border-dashed">
        <Train className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Розселення в потязі ще не завантажено</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {stats.map((s) => (
        <Card key={s.team_number} className="p-4 bg-card/80 backdrop-blur-md border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Команда №{s.team_number}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                {s.passengers} пасажирів · {s.coupes} купе
              </p>
            </div>
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => setOpenTeam(s.team_number)}>
              Редагувати <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </Card>
      ))}

      <Dialog open={openTeam !== null} onOpenChange={(o) => { if (!o) { setOpenTeam(null); load(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Команда №{openTeam} · потяг</DialogTitle></DialogHeader>
          {openTeam !== null && <CoupeManager myTeam={openTeam} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTrainView;