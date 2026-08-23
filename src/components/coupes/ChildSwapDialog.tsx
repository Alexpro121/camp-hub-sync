import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeftRight, Loader2, Train, User, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SEATS_PER_COUPE } from '@/lib/coupes';
import { useDynamicIsland } from '@/context/DynamicIslandContext';

export interface SwapRow {
  id: string;
  coupe_number: number;
  seat_number: number | null;
  passenger_name: string;
  child_id: string | null;
  is_staff: boolean | null;
}

interface Slot {
  coupe: number;
  seat: number;
  row: SwapRow | null;
}

/**
 * Wagon map for one child. Service coupes (staff, speakers, guests) are hidden
 * completely — a child only ever sees the children's coupes of their own team.
 */
const ChildSwapDialog = ({
  open,
  onOpenChange,
  childId,
  teamNumber,
  tripNumber,
  shiftId,
  rows,
  autoApprove,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  childId: string;
  teamNumber: number;
  tripNumber: number;
  shiftId: string | null;
  rows: SwapRow[];
  autoApprove: boolean;
  onDone: () => void;
}) => {
  const island = useDynamicIsland();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Slot | null>(null);

  const isStaffRow = (r: SwapRow) => r.is_staff === true || !r.child_id;
  const childCoupes = Array.from(
    new Set(rows.filter((r) => !isStaffRow(r)).map((r) => r.coupe_number)),
  ).sort((a, b) => a - b);

  const slotsOf = (coupe: number): Slot[] => {
    const base = (coupe - 1) * SEATS_PER_COUPE;
    return Array.from({ length: SEATS_PER_COUPE }, (_, i) => {
      const seat = base + i + 1;
      const row = rows.find((r) => r.coupe_number === coupe && r.seat_number === seat) ?? null;
      return { coupe, seat, row: row && isStaffRow(row) ? row : row };
    });
  };

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const peer = picked.row?.child_id ?? null;
      const status = peer ? 'pending_peer' : 'pending_supervisor';
      const { data, error } = await supabase
        .from('coupe_swap_requests')
        .insert({
          shift_id: shiftId,
          team_number: teamNumber,
          trip_number: tripNumber,
          requester_child_id: childId,
          target_child_id: peer,
          target_coupe_number: picked.coupe,
          target_seat_number: picked.seat,
          status,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (!peer && autoApprove) {
        const { data: ok, error: rpcErr } = await supabase.rpc('execute_coupe_swap', { p_request_id: data.id });
        if (rpcErr) throw rpcErr;
        if (!ok) throw new Error('Місце вже зайняте');
        island.showSuccess('Ти переїхав(ла)', `Купе №${picked.coupe}`);
      } else if (peer) {
        island.showSuccess('Пропозицію надіслано', `${picked.row?.passenger_name} має підтвердити обмін`);
      } else {
        island.showSuccess('Заявку надіслано вожатому', `Купе №${picked.coupe}`);
      }

      setPicked(null);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (/awaiting_target_consent/.test(msg)) {
        toast.info('Очікуємо підтвердження іншої дитини');
      } else if (/fair_closed|forbidden/.test(msg)) {
        toast.error('Обміни зараз недоступні');
      } else {
        toast.error(msg || 'Не вдалося надіслати заявку');
      }

    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPicked(null); onOpenChange(o); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Обери місце у вагоні</DialogTitle></DialogHeader>

        {!childCoupes.length && (
          <p className="text-sm text-muted-foreground">Дитячі купе ще не сформовані</p>
        )}

        <div className="space-y-2">
          {childCoupes.map((c) => (
            <div key={c} className="rounded-xl border border-border/40 bg-muted/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Train className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
                <p className="text-xs font-semibold">Купе №{c}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {slotsOf(c).map((s) => {
                  const mine = s.row?.child_id === childId;
                  const staff = s.row ? isStaffRow(s.row) : false;
                  const selected = picked?.coupe === s.coupe && picked?.seat === s.seat;
                  const disabled = mine || staff;
                  return (
                    <button
                      key={s.seat}
                      type="button"
                      disabled={disabled}
                      onClick={() => setPicked(s)}
                      className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-smooth ${
                        selected
                          ? 'border-primary bg-primary/15'
                          : disabled
                            ? 'border-border/30 bg-muted/30 opacity-60'
                            : 'border-border/40 bg-card/60 hover:border-primary/50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {s.row
                          ? <User className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                          : <UserPlus className="w-3 h-3 shrink-0 text-primary" strokeWidth={1.75} />}
                        <span className="truncate">
                          {staff ? 'Службове місце' : s.row ? s.row.passenger_name : 'Вільне місце'}
                        </span>
                      </span>
                      {mine && <Badge variant="secondary" className="mt-1 text-[9px]">Ти тут</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {picked && (
          <Button className="w-full h-11" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                {picked.row ? 'Запропонувати обмін місцями' : 'Переїхати сюди'}
              </>
            )}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChildSwapDialog;