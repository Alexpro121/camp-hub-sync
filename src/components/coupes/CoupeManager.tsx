import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, MapPin, Pencil, Plus, RotateCcw, Train, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { groupByCoupe, coupeOf } from '@/lib/coupes';
import { SINGLE_TRIP, TRAIN_TITLE } from '@/lib/trips';
import PassengerRoleBadge from '@/components/coupes/PassengerRoleBadge';
import { PASSENGER_ROLE_CHANNEL } from '@/lib/passengerRoles';
import { useDynamicIsland } from '@/context/DynamicIslandContext';

export interface CoupeRecord {
  id: string;
  shift_id: string | null;
  team_number: number;
  coupe_number: number;
  seat_number: number | null;
  passenger_name: string;
  boarding_city: string | null;
  is_staff: boolean | null;
  child_id: string | null;
  passenger_role?: string | null;
}

type Draft = {
  id?: string;
  passenger_name: string;
  boarding_city: string;
  coupe_number: number;
  team_number: number;
};

/** Saved train allocation with inline editing for admins and supervisors. */
const CoupeManager = ({
  myTeam,
  editable = true,
  refreshKey = 0,
}: {
  myTeam: number | null;
  editable?: boolean;
  refreshKey?: number;
}) => {
  const island = useDynamicIsland();
  const [rows, setRows] = useState<CoupeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = supabase.from('train_coupes').select('*').eq('trip_number', SINGLE_TRIP).order('coupe_number').order('seat_number');
    const { data } = myTeam !== null ? await q.eq('team_number', myTeam) : await q;
    setRows((data || []) as unknown as CoupeRecord[]);
    setLoading(false);
  }, [myTeam]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel(PASSENGER_ROLE_CHANNEL)
      .on('broadcast', { event: 'role_changed' }, ({ payload }) => {
        setRows((prev) => prev.map((r) => (r.id === payload?.id ? { ...r, passenger_role: payload.passenger_role } : r)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.passenger_name.trim();
    if (name.length < 2) { toast.error("Вкажи ПІБ пасажира"); return; }
    setBusy(true);
    try {
      const patch = {
        passenger_name: name,
        boarding_city: draft.boarding_city.trim() || null,
        coupe_number: Math.max(1, Number(draft.coupe_number) || 1),
        team_number: Number(draft.team_number) || 0,
      };
      if (draft.id) {
        const { error } = await supabase.from('train_coupes').update(patch).eq('id', draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('train_coupes').insert({
          ...patch,
          shift_id: rows[0]?.shift_id ?? null,
          trip_number: SINGLE_TRIP,
          trip_name: TRAIN_TITLE,
          seat_number: null,
          is_staff: false,
        });
        if (error) throw error;
      }
      setDraft(null);
      await load();
      toast.success(draft.id ? 'Оновлено' : 'Пасажира додано');
    } catch (e: any) {
      toast.error(e.message || 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id: string) => {
    const { error } = await supabase.from('train_coupes').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const clearAll = async () => {
    if (!rows.length) return;
    if (!confirm('Очистити збережене розселення? Далі можна імпортувати новий текст.')) return;
    setBusy(true);
    try {
      const ids = rows.map((r) => r.id);
      const { error } = await supabase.from('train_coupes').delete().in('id', ids);
      if (error) throw error;
      setRows([]);
      island.showSuccess('Розселення очищено', 'Можеш імпортувати новий список');
    } catch (e: any) {
      toast.error(e.message || 'Не вдалося очистити');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Card className="p-8 text-center bg-card/60"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></Card>;
  }

  const coupes = groupByCoupe(rows);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <p className="text-[11px] text-muted-foreground flex-1">
          {rows.length} пасажирів · {coupes.length} купе
        </p>
        {editable && (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              onClick={() => setDraft({ passenger_name: '', boarding_city: '', coupe_number: (coupes.at(-1)?.coupe_number ?? 0) + 1, team_number: myTeam ?? rows[0]?.team_number ?? 0 })}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Пасажир
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={clearAll} disabled={busy || !rows.length}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Очистити
            </Button>
          </>
        )}
      </div>

      {!rows.length && (
        <Card className="p-8 text-center bg-card/60 border-dashed">
          <Train className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Розселення в потязі ще не завантажено</p>
        </Card>
      )}

      {coupes.map((c) => (
        <Card key={c.coupe_number} className="p-4 bg-card/80 backdrop-blur-md border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Train className="w-4 h-4 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground leading-none">Купе</p>
              <p className="text-xl font-semibold leading-tight tabular-nums">№{c.coupe_number}</p>
            </div>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{c.passengers.length} / 4</span>
          </div>

          <div className="space-y-1.5">
            {c.passengers.map((p: any) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-border/40 bg-muted/30">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span className="text-sm break-words flex-1 min-w-0">{p.passenger_name}</span>
                <PassengerRoleBadge
                  passengerId={p.id}
                  role={p.passenger_role}
                  editable={editable}
                  onChanged={(role) =>
                    setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, passenger_role: role } : r)))
                  }
                />
                {p.boarding_city && (
                  <Badge variant="outline" className="text-[9px] gap-1 shrink-0">
                    <MapPin className="w-2.5 h-2.5" strokeWidth={2} />{p.boarding_city}
                  </Badge>
                )}
                {editable && (
                  <div className="flex items-center shrink-0">
                    <button
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-smooth"
                      onClick={() => setDraft({
                        id: p.id,
                        passenger_name: p.passenger_name,
                        boarding_city: p.boarding_city ?? '',
                        coupe_number: p.coupe_number,
                        team_number: p.team_number,
                      })}
                      aria-label="Редагувати пасажира"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-smooth"
                      onClick={() => removeOne(p.id)}
                      aria-label="Видалити пасажира"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{draft?.id ? 'Редагувати пасажира' : 'Новий пасажир'}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">ПІБ</Label>
                <Input value={draft.passenger_name} onChange={(e) => setDraft({ ...draft, passenger_name: e.target.value })} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Місто підсадки</Label>
                <Input value={draft.boarding_city} onChange={(e) => setDraft({ ...draft, boarding_city: e.target.value })} placeholder="Львів" className="h-11" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Купе №</Label>
                  <Input type="number" min={1} value={draft.coupe_number} onChange={(e) => setDraft({ ...draft, coupe_number: Number(e.target.value) })} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Команда</Label>
                  <Input type="number" min={0} value={draft.team_number} disabled={myTeam !== null} onChange={(e) => setDraft({ ...draft, team_number: Number(e.target.value) })} className="h-11" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="w-full h-11" onClick={saveDraft} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Зберегти'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { coupeOf };
export default CoupeManager;
