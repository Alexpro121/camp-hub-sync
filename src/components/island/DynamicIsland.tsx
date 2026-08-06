import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, Megaphone, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { onIslandMessage, pushIsland, TONE_CLASSES, type IslandMessage, type IslandTone } from '@/lib/islandBus';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  /** Team of the current user — used to filter targeted broadcasts. */
  myTeam?: number | null;
}

const DynamicIsland = ({ myTeam = null }: Props) => {
  const { state, pending } = useNetworkStatus();
  const [msg, setMsg] = useState<IslandMessage | null>(null);
  const haptics = useHaptics();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (m: IslandMessage) => {
    setMsg(m);
    haptics.impact('medium');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), m.ttl ?? 5000);
  };

  useEffect(() => {
    const off = onIslandMessage(show);
    return () => { off(); if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime broadcasts from staff
  useEffect(() => {
    const ch = supabase
      .channel('island-broadcasts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, (payload) => {
        const b: any = payload.new;
        const teams: number[] = Array.isArray(b.target_teams) ? b.target_teams : [];
        if (teams.length && myTeam != null && !teams.includes(myTeam)) return;
        pushIsland(b.message, (b.color as IslandTone) || 'info', b.sent_by || undefined, 8000);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myTeam]);

  const compact = !msg;
  const tone = msg?.tone ?? 'info';

  const statusIcon =
    state === 'offline' ? <WifiOff className="w-3.5 h-3.5 text-warning" />
    : state === 'syncing' ? <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
    : <Wifi className="w-3.5 h-3.5 text-success" />;

  const statusText =
    state === 'offline' ? (pending ? `Офлайн · ${pending} у черзі` : 'Офлайн')
    : state === 'syncing' ? 'Синхронізація…'
    : pending ? `${pending} у черзі` : 'Онлайн';

  return (
    <div className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none safe-top top-0">
      <div
        onClick={() => msg && setMsg(null)}
        className={`pointer-events-auto overflow-hidden border shadow-card backdrop-blur-xl transition-all duration-500 ease-out
          ${compact
            ? 'rounded-full px-3 py-1.5 bg-background/80 border-border/60 max-w-[220px]'
            : `rounded-3xl px-4 py-3 max-w-[92vw] w-[420px] cursor-pointer ${TONE_CLASSES[tone]}`}`}
      >
        {compact ? (
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="text-[11px] font-medium whitespace-nowrap tabular-nums">{statusText}</span>
          </div>
        ) : (
          <div className="flex items-start gap-3 animate-scale-in">
            <div className="w-8 h-8 rounded-full bg-black/15 flex items-center justify-center shrink-0">
              {tone === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug break-words">{msg?.text}</p>
              {msg?.meta && <p className="text-[11px] opacity-80 mt-0.5">{msg.meta}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DynamicIsland;