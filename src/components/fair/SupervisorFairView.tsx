import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Coins, RefreshCw, ShoppingBag, Receipt, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import QrSvg from './QrSvg';
import {
  FAIR_PRESETS,
  createFairPayload,
  formatFairCode,
  validateFairAmount,
  type FairQrPayload,
} from '@/lib/fair';

interface Props { myTeam: number | null }

interface FeedRow {
  id: string;
  child_name: string;
  team_number: number;
  amount: number;
  created_at: string;
}

/** DOM stays small: only the newest receipts are kept in memory. */
const FEED_LIMIT = 15;
/** The success card disappears on its own — no taps, never blocks the next QR. */
const SUCCESS_CARD_MS = 2500;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

/* ---------------------------------- Presets --------------------------------- */

interface PresetProps {
  value: number;
  custom: boolean;
  onPick: (v: number) => void;
}

const PresetSelector = memo(({ value, custom, onPick }: PresetProps) => (
  <div className="grid grid-cols-5 gap-1.5 mb-3">
    {FAIR_PRESETS.map((p) => (
      <button
        key={p}
        type="button"
        onClick={() => onPick(p)}
        className={[
          'h-11 rounded-xl text-sm font-semibold tabular-nums border transition-all duration-300',
          'ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95',
          value === p && !custom
            ? 'bg-primary/15 text-primary border-primary/30'
            : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40',
        ].join(' ')}
      >
        {p}
      </button>
    ))}
  </div>
));
PresetSelector.displayName = 'PresetSelector';

/* --------------------------------- QR panel --------------------------------- */

interface QrProps {
  payload: FairQrPayload | null;
  amount: number;
  stale: boolean;
}

const QrDisplay = memo(({ payload, amount, stale }: QrProps) => {
  const qrValue = useMemo(() => (payload ? JSON.stringify(payload) : ''), [payload]);
  return (
    <div className="mt-4 flex flex-col items-center">
      <div
        className="rounded-3xl bg-white p-3 border border-border/40 shadow-sm transition-opacity duration-200"
        style={{ opacity: stale ? 0.55 : 1 }}
      >
        {qrValue && <QrSvg value={qrValue} size={210} />}
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{amount}</p>
      <p className="text-xs text-muted-foreground">Айрон-доларів до списання</p>
      {payload && (
        <p className="mt-2 text-[11px] font-mono tracking-[0.18em] text-muted-foreground">
          {formatFairCode(payload.code)}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Код діє 2 години</p>
    </div>
  );
});
QrDisplay.displayName = 'QrDisplay';

/* -------------------------------- Live feed --------------------------------- */

const LiveReceiptsFeed = memo(({ feed }: { feed: FeedRow[] }) => {
  const total = useMemo(() => feed.reduce((s, r) => s + r.amount, 0), [feed]);
  return (
    <Card className="p-4 border-border/50 bg-card/80 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold tracking-tight">Покупки в реальному часі</h3>
        </div>
        <Badge variant="secondary" className="tabular-nums">{total} 💰</Badge>
      </div>

      {feed.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Поки що покупок немає</p>
      ) : (
        <ul className="space-y-1.5">
          {feed.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/25 px-3 py-2 animate-fade-in"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.child_name}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Команда {r.team_number} · {time(r.created_at)}
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm font-semibold text-primary tabular-nums">
                <Coins className="w-3.5 h-3.5" strokeWidth={1.9} />−{r.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
});
LiveReceiptsFeed.displayName = 'LiveReceiptsFeed';

/* ------------------------------ Success card -------------------------------- */

interface SuccessToast { id: string; name: string; team: number; amount: number }

const PaymentSuccessCard = memo(({ toast }: { toast: SuccessToast | null }) => (
  <div className="pointer-events-none fixed inset-x-4 top-4 z-[90] flex justify-center">
    {toast && (
      <div
        key={toast.id}
        className="animate-scale-in rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl px-4 py-3 shadow-lg flex items-center gap-3"
      >
        <span className="text-xl">🎉</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums text-primary">+{toast.amount} 💰</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {toast.name} (Команда №{toast.team})
          </p>
        </div>
      </div>
    )}
  </div>
));
PaymentSuccessCard.displayName = 'PaymentSuccessCard';

/* ---------------------------------- Screen ---------------------------------- */

const SupervisorFairView = ({ myTeam }: Props) => {
  const [amount, setAmount] = useState<number>(FAIR_PRESETS[2]);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<SuccessToast | null>(null);
  const [allowOtherTeams, setAllowOtherTeams] = useState(false);
  const [, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const seenRef = useRef<Set<string>>(new Set());
  const haptics = useHaptics();

  // Typing stays at 60 FPS: the QR payload only follows the deferred amount.
  const deferredAmount = useDeferredValue(amount);
  const deferredNonce = useDeferredValue(nonce);
  const stale = deferredAmount !== amount || deferredNonce !== nonce;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Fair access settings for this supervisor (default: own team only).
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    supabase
      .from('fair_settings')
      .select('allow_other_teams')
      .eq('supervisor_user_id', userId)
      .maybeSingle()
      .then(({ data }) => { if (mounted && data) setAllowOtherTeams(!!data.allow_other_teams); });
    return () => { mounted = false; };
  }, [userId]);

  const toggleAllowOtherTeams = useCallback(async (next: boolean) => {
    if (!userId) return;
    haptics.selection();
    setAllowOtherTeams(next);
    const { error } = await supabase
      .from('fair_settings')
      .upsert(
        { supervisor_user_id: userId, team_number: myTeam, allow_other_teams: next },
        { onConflict: 'supervisor_user_id' },
      );
    if (error) setAllowOtherTeams(!next);
  }, [userId, myTeam, haptics]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const payload = useMemo<FairQrPayload | null>(() => {
    if (!Number.isFinite(deferredAmount) || deferredAmount <= 0) return null;
    // deferredNonce is a manual-refresh trigger for a brand new tx_id.
    void deferredNonce;
    return createFairPayload({
      amount: deferredAmount,
      supervisorId: userId,
      supervisorTeam: myTeam,
      supervisorName: myTeam ? `Ярмарок · Команда ${myTeam}` : 'Ярмарок',
    });
  }, [deferredAmount, deferredNonce, userId, myTeam]);

  const applyPreset = useCallback((value: number) => {
    haptics.impact('light');
    setCustom('');
    setError(null);
    setAmount(value);
  }, [haptics]);

  const applyCustom = useCallback((raw: string) => {
    setCustom(raw);
    if (!raw.trim()) { setError(null); return; }
    const res = validateFairAmount(raw);
    if (res.ok) { setError(null); setAmount(res.amount); }
    else setError(res.error);
  }, []);

  // Live payment feed — driven by the Iron Dollar ledger so manual credits show up too.
  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    const pushReceipt = (row: FeedRow) => {
      if (!mounted) return;
      // Manual-code payments arrive on two channels — never show them twice.
      // The ledger row and the receipt row have different ids, so dedupe on the
      // purchase itself: same child + amount within a couple of seconds.
      const key = `${row.child_name}:${row.amount}:${Math.round(new Date(row.created_at).getTime() / 2000)}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      // Instant QR rotation: the scanned code can never be reused.
      startTransition(() => setNonce((n) => n + 1));
      haptics.notification('success');
      setToast({ id: row.id, name: row.child_name, team: row.team_number, amount: row.amount });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), SUCCESS_CARD_MS);
      setFeed((prev) => [row, ...prev.slice(0, FEED_LIMIT - 1)]);
    };

    const load = async () => {
      const { data } = await supabase
        .from('fair_payments')
        .select('id, child_name, team_number, amount, created_at')
        .eq('supervisor_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (mounted) setFeed((data || []) as FeedRow[]);
    };
    load();
    // Server-side filter keeps the Telegram WebView off other supervisors' traffic.
    const ch = supabase
      .channel(`supervisor_iron_txs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'iron_dollar_transactions',
        filter: `supervisor_user_id=eq.${userId}`,
      }, async (p) => {
        const tx = p.new as {
          id: string; child_id: string; amount_change: number; created_at: string;
        };
        // Resolve the child's full name and team for the success HUD.
        const { data: child } = await supabase
          .from('children')
          .select('full_name, team_number')
          .eq('id', tx.child_id)
          .maybeSingle();
        if (!mounted) return;

        pushReceipt({
          id: tx.id,
          child_name: child?.full_name ?? 'Дитина',
          team_number: child?.team_number ?? 0,
          amount: Math.abs(tx.amount_change),
          created_at: tx.created_at,
        });
      })
      .subscribe();

    // Fallback: a manually typed fair code carries no supervisor id, so the ledger
    // filter above never fires. Watch this team's fair receipts instead.
    const teamCh = myTeam == null ? null : supabase
      .channel(`supervisor_fair_team:${myTeam}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'fair_payments',
        filter: `team_number=eq.${myTeam}`,
      }, (p) => {
        const r = p.new as FeedRow & { supervisor_user_id: string | null };
        if (r.supervisor_user_id && r.supervisor_user_id !== userId) return;
        pushReceipt({
          id: r.id,
          child_name: r.child_name,
          team_number: r.team_number,
          amount: Math.abs(r.amount),
          created_at: r.created_at,
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
      if (teamCh) supabase.removeChannel(teamCh);
    };
  }, [userId, myTeam, haptics]);

  return (
    <div className="space-y-3">
      <PaymentSuccessCard toast={toast} />
      <Card className="p-4 border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="w-4 h-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold tracking-tight">Оплата на ярмарку</h2>
        </div>

        <PresetSelector value={amount} custom={!!custom} onPick={applyPreset} />

        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            placeholder="Своя сума"
            value={custom}
            onChange={(e) => applyCustom(e.target.value)}
            className="h-11"
          />
          <Button
            variant="secondary"
            className="h-11 px-3"
            onClick={() => { haptics.impact('light'); setNonce((n) => n + 1); }}
            title="Новий QR"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.9} />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}

        <QrDisplay payload={payload} amount={amount} stale={stale} />
      </Card>

      <Card className="p-4 border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Users className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <Label htmlFor="allow-other-teams" className="text-sm font-medium">
                Дозволити оплату дітям з інших команд
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {allowOtherTeams
                  ? 'Купувати можуть діти з будь-якої команди'
                  : `Купувати можуть лише діти Команди №${myTeam ?? '—'}`}
              </p>
            </div>
          </div>
          <Switch
            id="allow-other-teams"
            checked={allowOtherTeams}
            onCheckedChange={toggleAllowOtherTeams}
            disabled={!userId}
          />
        </div>
      </Card>

      <LiveReceiptsFeed feed={feed} />
    </div>
  );
};

export default SupervisorFairView;
