import { useEffect, useState } from 'react';
import { FlaskConical, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { staffCall, staffErr } from '@/lib/staffApi';
import { cn } from '@/lib/utils';

interface TeamInfo { team: number; children: number; staff: string[] }
interface ShiftInfo { id: string; name: string }

/**
 * Вибір команди за кнопкою запрошення в тестову зміну (?pick=<токен посилання зміни>).
 * Номер обирає сам супровід; сервер (join_shift) перевіряє, що така команда є в зміні.
 */
const TestTeamPicker = ({ token, onJoined, onClose }: {
  token: string;
  onJoined: (shiftId: string, team: number) => Promise<void> | void;
  onClose: () => void;
}) => {
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [team, setTeam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    staffCall({ action: 'invite_check', token }, { signal: ac.signal })
      .then((d) => {
        if (!d?.shift) { setState('invalid'); return; }
        setShift(d.shift);
        setTeams(Array.isArray(d.teams) ? d.teams : []);
        setState('ok');
      })
      .catch((e) => { if (!(e instanceof Error && e.message === 'aborted')) setState('invalid'); });
    return () => ac.abort();
  }, [token]);

  const join = async () => {
    if (team === null || busy) return;
    setBusy(true);
    try {
      const res = await staffCall({ action: 'join_shift', token, team_number: team });
      await onJoined(String(res.shift_id), Number(res.team_number));
      if (res.already_assigned && Number(res.team_number) !== team) toast(`Ви вже в команді №${res.team_number}`);
    } catch (e) {
      toast.error(staffErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-400/60 bg-amber-400/10 p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><FlaskConical className="size-4 text-amber-500" />{shift?.name ?? 'Тестова зміна'}</div>
        <p className="mt-1 text-xs text-muted-foreground">Оберіть номер своєї команди — після цього вона одразу відкриється.</p>
      </div>

      {state === 'loading' && <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}</div>}

      {state === 'invalid' && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="font-semibold">Тестова зміна вже закрита</p>
          <Button variant="secondary" className="w-full rounded-xl" onClick={onClose}>До кабінету</Button>
        </div>
      )}

      {state === 'ok' && (
        <>
          <div role="radiogroup" aria-label="Команда" className="grid grid-cols-2 gap-2">
            {teams.map((t) => {
              const on = team === t.team;
              return (
                <button key={t.team} type="button" role="radio" aria-checked={on} onClick={() => setTeam(t.team)}
                  className={cn('rounded-2xl border p-3 text-left transition-all active:scale-[0.97]', on ? 'border-primary bg-primary/10 ring-2 ring-primary/40' : 'border-border bg-card hover:border-primary/40')}>
                  <div className="text-lg font-black">№{t.team}</div>
                  <div className="text-[11px] text-muted-foreground">{t.children} дітей</div>
                  <div className={cn('mt-1 truncate text-[11px]', t.staff.length ? 'text-primary' : 'text-muted-foreground')} title={t.staff.join(', ')}>
                    {t.staff.length ? `Супровід: ${t.staff.join(', ')}` : 'Поки без супроводу'}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <Users className="mt-0.5 size-4 shrink-0 text-primary" />В одній команді може бути кілька людей. Змінити команду потім не вийде — оберіть уважно.
          </div>
          <Button onClick={join} disabled={team === null || busy} className="h-12 w-full rounded-xl font-bold">
            {busy ? <Loader2 className="size-5 animate-spin" /> : team === null ? 'Оберіть команду' : `Увійти в команду №${team}`}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>Пізніше</Button>
        </>
      )}
    </div>
  );
};

export default TestTeamPicker;
