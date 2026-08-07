import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Pencil, Train, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import CoupeManager from '@/components/coupes/CoupeManager';
import { groupByTeamThenCoupe } from '@/lib/coupes';

interface Row {
  id: string;
  team_number: number;
  coupe_number: number;
  seat_number: number | null;
  passenger_name: string;
  boarding_city: string | null;
  is_staff: boolean | null;
}

/** Admin train allocation grouped by team, each team editable in its own dialog. */
const AdminTrainView = ({ refreshKey = 0, trip = 1 }: { refreshKey?: number; trip?: number }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTeam, setOpenTeam] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('train_coupes')
      .select('id, team_number, coupe_number, seat_number, passenger_name, boarding_city, is_staff')
      .eq('trip_number', trip)
      .order('coupe_number')
      .order('seat_number');
    setRows((data || []) as unknown as Row[]);
    setLoading(false);
  }, [trip]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) {
    return <Card className="p-8 text-center bg-card/60"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></Card>;
  }

  const teams = groupByTeamThenCoupe(rows);

  if (!teams.length) {
    return (
      <Card className="p-8 text-center bg-card/60 border-dashed">
        <Train className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Розселення в потязі ще не завантажено</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Accordion type="multiple" className="space-y-2">
        {teams.map((t) => (
          <AccordionItem
            key={t.team_number}
            value={String(t.team_number)}
            className="border border-border/50 rounded-xl bg-card/80 backdrop-blur-md px-3"
          >
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">Команда №{t.team_number}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                    {t.total} пасажирів · {t.coupes.length} купе
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-2">
              <Button size="sm" variant="secondary" className="h-8 text-xs w-full" onClick={() => setOpenTeam(t.team_number)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Редагувати склад команди
              </Button>
              {t.coupes.map((c) => (
                <div key={c.coupe_number} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Train className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                    <p className="text-xs font-semibold">Купе №{c.coupe_number}</p>
                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                      {Math.min(c.passengers.length, 4)} / 4
                    </span>
                  </div>
                  <div className="space-y-1">
                    {c.passengers.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 min-w-0 break-words">{p.passenger_name}</span>
                        {p.boarding_city && (
                          <Badge variant="outline" className="text-[9px] gap-1 shrink-0">
                            <MapPin className="w-2.5 h-2.5" strokeWidth={2} />{p.boarding_city}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Dialog open={openTeam !== null} onOpenChange={(o) => { if (!o) { setOpenTeam(null); load(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Команда №{openTeam} · потяг</DialogTitle></DialogHeader>
          {openTeam !== null && <CoupeManager myTeam={openTeam} trip={trip} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTrainView;