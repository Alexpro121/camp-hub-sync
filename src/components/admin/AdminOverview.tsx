import { useEffect, useState } from 'react';
import { CalendarDays, Bell, Users, Calendar, ArrowRight, RefreshCw, BarChart3, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveShift } from '@/context/ActiveShiftContext';
import { supabase } from '@/integrations/supabase/client';
import { shiftStatus } from '@/lib/shift';
import { teamsOf } from '@/lib/shift-resolver';

type OverviewProps = { onNavigate: (tab: string) => void; unread: number };

const formatDate = (date: string) => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));

export default function AdminOverview({ onNavigate, unread }: OverviewProps) {
  const { shift, loading: shiftsLoading } = useActiveShift();
  const [summary, setSummary] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    setSummary(null);
    setUpdatedAt(null);
    setError(false);
    if (!shift) return () => { active = false; };
    setLoading(true);
    supabase.from('children').select('id', { count: 'exact', head: true }).eq('shift_id', shift.id).then(({ count, error: requestError }) => {
      if (!active) return;
      setLoading(false);
      if (requestError) { setError(true); return; }
      setSummary(count ?? 0);
      setUpdatedAt(new Date());
    });
    return () => { active = false; };
  }, [shift?.id, refresh]);

  if (shiftsLoading) return <div className="space-y-3 pt-5" aria-label="Завантаження огляду"><div className="h-32 animate-pulse rounded-md bg-muted" /><div className="h-20 animate-pulse rounded-md bg-muted" /></div>;
  if (!shift) return <div className="py-12 text-center"><h2 className="text-xl font-bold">Змін поки немає</h2><p className="mt-2 text-sm text-muted-foreground">Створіть першу зміну, щоб почати роботу.</p><Button className="mt-5" onClick={() => onNavigate('shifts')}>Створити зміну <ArrowRight /></Button></div>;

  const status = shiftStatus(shift);
  return (
    <div className="space-y-7 py-5">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{status === 'active' ? 'Триває зараз' : status === 'upcoming' ? 'Незабаром' : 'Завершена зміна'}</p>
          <h1 className="mt-1 break-words text-2xl font-bold text-foreground sm:text-3xl">{shift.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{formatDate(shift.start_date)} - {formatDate(shift.end_date)}</p>
          {updatedAt && <p className="mt-1 text-[11px] text-muted-foreground">Оновлено о {updatedAt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
        <Button size="icon" variant="ghost" disabled={loading} onClick={() => setRefresh(n => n + 1)} aria-label="Оновити огляд" className="shrink-0 active:scale-95">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3" aria-label="Підсумок зміни">
        <div className="border-l-2 border-primary bg-card px-4 py-4">
          <p className="text-xs text-muted-foreground">Дітей</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '…' : error ? '—' : summary ?? '—'}</p>
        </div>
        <div className="border-l-2 border-border bg-card px-4 py-4">
          <p className="text-xs text-muted-foreground">Команд</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{teamsOf(shift).length || '—'}</p>
        </div>
      </div>
      {error && <div className="flex items-center gap-2 text-sm text-destructive">Не вдалося завантажити підсумок. <Button size="sm" variant="ghost" onClick={() => setRefresh(n => n + 1)}><RefreshCw /> Повторити</Button></div>}

      <section aria-label="Швидкі дії">
        <h2 className="mb-3 text-base font-semibold">Швидкі дії</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { tab: 'schedule', label: 'Розклад', icon: CalendarDays },
            { tab: 'staff', label: 'Супровід', icon: Users },
            { tab: 'shifts', label: 'Зміни', icon: Calendar },
            { tab: 'notifications', label: unread ? `Сповіщення (${unread})` : 'Сповіщення', icon: Bell },
            { tab: 'stats', label: 'Статистика', icon: BarChart3 },
            { tab: 'data', label: 'База', icon: Database },
          ].map(({ tab, label, icon: Icon }) => (
            <Button key={tab} variant="secondary" onClick={() => onNavigate(tab)} className="h-16 min-w-0 flex-col gap-1.5 text-xs transition-[transform,background-color] duration-150 active:scale-[0.97] motion-reduce:transition-none sm:h-20 sm:text-sm">
              <Icon className="size-5" aria-hidden="true" /><span className="max-w-full truncate">{label}</span>
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}