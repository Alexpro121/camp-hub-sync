import { useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import {
  PASSENGER_ROLES, PASSENGER_ROLE_CHANNEL, roleMeta, type PassengerRole,
} from '@/lib/passengerRoles';

/** Role badge; when editable, one tap opens the role picker and saves it. */
const PassengerRoleBadge = ({
  passengerId,
  role,
  editable = false,
  onChanged,
}: {
  passengerId?: string | null;
  role?: string | null;
  editable?: boolean;
  onChanged?: (role: PassengerRole) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const meta = roleMeta(role);

  const badge = (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium shrink-0 ${meta.badge} ${
        editable ? 'cursor-pointer hover:opacity-80 transition-smooth' : ''
      }`}
    >
      {meta.label}
    </span>
  );

  if (!editable || !passengerId) return badge;

  const pick = async (next: PassengerRole) => {
    if (next === meta.value || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from('train_coupes')
      .update({ passenger_role: next })
      .eq('id', passengerId);
    setBusy(false);
    if (error) { toast.error(error.message || 'Не вдалося змінити роль'); return; }
    onChanged?.(next);
    supabase.channel(PASSENGER_ROLE_CHANNEL).send({
      type: 'broadcast',
      event: 'role_changed',
      payload: { id: passengerId, passenger_role: next },
    });
    toast.success(`Роль: ${roleMeta(next).label}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        <button type="button" aria-label="Змінити роль пасажира">{badge}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {PASSENGER_ROLES.map((r) => (
          <DropdownMenuItem key={r.value} onClick={() => pick(r.value)} className="text-xs gap-2">
            <span>{r.dot}</span> {r.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PassengerRoleBadge;
