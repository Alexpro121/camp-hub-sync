import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppNotification } from '@/types/app';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowRightLeft, Bell, BellOff, CheckCheck, RefreshCw, Search } from 'lucide-react';
import { InlineLoader } from '@/components/ui/loader';
import { toast } from 'sonner';

export const ADMIN_NOTIF_SEEN_KEY = 'admin_transfers_seen_at';

export const getSeenAt = (): number => {
  const raw = localStorage.getItem(ADMIN_NOTIF_SEEN_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
};

type Filter = 'all' | 'transfer' | 'swap';

const relativeTime = (iso: string): string => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  const time = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return `Сьогодні, ${time}`;
  const y = new Date(today.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return `Вчора, ${time}`;
  return `${d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}, ${time}`;
};

const teamsOf = (n: AppNotification): { from?: number; to?: number; a?: number; b?: number } => {
  const m = (n.metadata ?? {}) as Record<string, unknown>;
  return {
    from: typeof m.from_team === 'number' ? m.from_team : undefined,
    to: typeof m.to_team === 'number' ? m.to_team : undefined,
    a: typeof m.team_a === 'number' ? m.team_a : undefined,
    b: typeof m.team_b === 'number' ? m.team_b : undefined,
  };
};

const TeamBadge = ({ team }: { team: number }) => (
  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-black font-mono tabular-nums text-slate-200">
    Команда №{team}
  </span>
);

const AdminNotificationsView = () => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [seenAt, setSeenAt] = useState<number>(() => getSeenAt());

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .in('type', ['transfer', 'swap'])
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error) setItems((data || []) as AppNotification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-transfers-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (filter !== 'all' && n.type !== filter) return false;
      if (!q) return true;
      return `${n.title} ${n.message}`.toLowerCase().includes(q);
    });
  }, [items, query, filter]);

  const unread = useMemo(
    () => items.filter((n) => new Date(n.created_at).getTime() > seenAt).length,
    [items, seenAt],
  );

  const markAllRead = () => {
    const ts = Date.now();
    localStorage.setItem(ADMIN_NOTIF_SEEN_KEY, String(ts));
    setSeenAt(ts);
    window.dispatchEvent(new Event('admin-notifications-seen'));
    toast.success('Позначено як прочитані');
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) return <InlineLoader label="Завантаження подій" />;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-[#0A0E18]/80 backdrop-blur-2xl p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-[#FA5A15] shrink-0" />
            <p className="text-xs sm:text-sm font-black uppercase tracking-wide text-white truncate">
              Лог трансферів
            </p>
            {unread > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#FA5A15] text-[10px] font-black text-white font-mono tabular-nums">
                {unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="icon" variant="ghost" onClick={refresh} className="h-9 w-9" aria-label="Оновити">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={markAllRead}
              disabled={unread === 0}
              className="h-9 text-[11px] font-bold"
            >
              <CheckCheck className="w-4 h-4 mr-1" /> Прочитано
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук за ПІБ або командою..."
            className="pl-10 h-11 bg-white/5 border-white/10"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
          {([
            { id: 'all' as Filter, label: 'Всі події' },
            { id: 'transfer' as Filter, label: 'Трансфери ➔' },
            { id: 'swap' as Filter, label: 'Обміни ⇄' },
          ]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 min-h-[36px] px-3 rounded-xl text-[11px] font-black uppercase tracking-wide border transition-colors ${
                filter === f.id
                  ? 'bg-[#FA5A15] text-white border-[#FA5A15]'
                  : 'bg-white/5 text-slate-300 border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0A0E18]/80 backdrop-blur-2xl p-8 text-center">
          <BellOff className="w-8 h-8 mx-auto text-slate-600" />
          <p className="mt-3 text-sm font-black text-white">Історія переведень чиста</p>
          <p className="mt-1 text-xs text-slate-400">
            Тут з’являться всі переведення та обміни учасниками між командами.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const isSwap = n.type === 'swap';
            const t = teamsOf(n);
            const isNew = new Date(n.created_at).getTime() > seenAt;
            return (
              <div
                key={n.id}
                className={`rounded-2xl border bg-[#0A0E18]/80 backdrop-blur-2xl p-3 flex gap-3 ${
                  isNew ? 'border-[#FA5A15]/40' : 'border-white/10'
                }`}
              >
                <div
                  className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border ${
                    isSwap
                      ? 'bg-[#FA5A15]/10 border-[#FA5A15]/30 text-[#FA5A15]'
                      : 'bg-white/5 border-white/10 text-slate-200'
                  }`}
                >
                  {isSwap ? <ArrowRightLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-300">
                      {isSwap ? 'Обмін учасниками між командами' : 'Переведення учасника'}
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {relativeTime(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-white break-words">{n.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {isSwap ? (
                      <>
                        {t.a !== undefined && <TeamBadge team={t.a} />}
                        {t.a !== undefined && t.b !== undefined && (
                          <ArrowRightLeft className="w-3 h-3 text-slate-500" />
                        )}
                        {t.b !== undefined && <TeamBadge team={t.b} />}
                      </>
                    ) : (
                      <>
                        {t.from !== undefined && <TeamBadge team={t.from} />}
                        {t.from !== undefined && t.to !== undefined && (
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                        )}
                        {t.to !== undefined && <TeamBadge team={t.to} />}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminNotificationsView;
