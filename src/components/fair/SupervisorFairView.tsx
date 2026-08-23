import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { 
  Check, 
  Coins, 
  RefreshCw, 
  ShoppingBag, 
  Receipt, 
  Users, 
  Wallet, 
  KeyRound, 
  Copy, 
  Radio, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Store 
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import FairHowTo from './FairHowTo';
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
  validateFairAmount,
  type FairQrPayload,
} from '@/lib/fair';

interface Props {
  myTeam: number | null;
  isLive?: boolean;
}

interface FeedRow {
  id: string;
  child_name: string;
  team_number: number;
  amount: number;
  created_at: string;
}

interface PushPaymentRequest {
  requestId: string;
  childName: string;
  childTeam: number;
  amount: number;
  timestamp: number;
}

const FEED_LIMIT = 15;
const SUCCESS_CARD_MS = 2500;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

/* ---------------------------------- Пресети --------------------------------- */

interface PresetProps {
  value: number;
  custom: boolean;
  onPick: (v: number) => void;
}

const PresetSelector = memo(({ value, custom, onPick }: PresetProps) => (
  <div className="grid grid-cols-5 gap-1.5 mb-2.5">
    {FAIR_PRESETS.map((p) => (
      <button
        key={p}
        type="button"
        onClick={() => onPick(p)}
        className={[
          'h-11 rounded-xl text-xs sm:text-sm font-mono font-bold tabular-nums border transition-all duration-300',
          'active:scale-95 flex items-center justify-center gap-0.5',
          value === p && !custom
            ? 'bg-[#FA5A15] text-white border-[#FA5A15] shadow-[0_0_14px_rgba(250,90,21,0.35)] scale-[1.02]'
            : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40',
        ].join(' ')}
      >
        <span>{p}</span>
        <span className="text-[9px] font-sans opacity-80">А$</span>
      </button>
    ))}
  </div>
));
PresetSelector.displayName = 'PresetSelector';

/* --------------------------------- Панель QR --------------------------------- */

interface QrProps {
  payload: FairQrPayload | null;
  amount: number;
  stale: boolean;
}

const QrDisplay = memo(({ payload, amount, stale }: QrProps) => {
  const [copied, setCopied] = useState(false);
  const haptics = useHaptics();
  const qrValue = useMemo(() => (payload ? JSON.stringify(payload) : ''), [payload]);

  const handleCopyCode = () => {
    if (!payload?.code) return;
    navigator.clipboard.writeText(payload.code);
    haptics.impact('light');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeDigits = (payload?.code ?? '').padEnd(5, '•').slice(0, 5).split('');

  return (
    <div className="mt-4 flex flex-col items-center select-none">
      <div
        className="transition-opacity duration-200"
        style={{ opacity: stale ? 0.55 : 1 }}
      >
        {qrValue && <QrSvg value={qrValue} size={220} />}
      </div>
      
      <div className="text-center mt-3">
        <p className="font-mono text-3xl font-black tracking-tight text-foreground flex items-baseline justify-center gap-1">
          <span className="text-[#FA5A15]">{amount}</span>
          <span className="text-sm font-sans font-bold text-muted-foreground">Айрон-доларів</span>
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Сума до списання з балансу дитини</p>
      </div>

      {payload && (
        <div 
          onClick={handleCopyCode}
          className="mt-4 w-full rounded-2xl border border-border/60 bg-surface-1/60 hover:bg-muted/40 p-3 text-center cursor-pointer active:scale-[0.99] transition-all space-y-1.5"
          title="Клацніть, щоб скопіювати код"
        >
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            <div className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#FA5A15]" />
              <span>Код для ручного введення</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono lowercase">
              {copied ? 'скопійовано' : 'копіювати'}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 pt-0.5">
            {codeDigits.map((digit, idx) => (
              <div
                key={idx}
                className="w-10 h-11 rounded-xl bg-background/80 border border-border/60 flex items-center justify-center font-mono text-xl font-black text-foreground shadow-inner"
              >
                {digit}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
QrDisplay.displayName = 'QrDisplay';

/* -------------------------------- Live feed --------------------------------- */

const LiveReceiptsFeed = memo(({ feed }: { feed: FeedRow[] }) => {
  const total = useMemo(() => feed.reduce((s, r) => s + r.amount, 0), [feed]);
  return (
    <Card className="p-4 border-border/50 bg-card/85 backdrop-blur-xl rounded-3xl shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
          <h3 className="text-sm font-bold tracking-tight text-foreground">Журнал покупок</h3>
        </div>
        <Badge variant="secondary" className="font-mono text-xs font-bold text-[#FA5A15] bg-[#FA5A15]/10 border-[#FA5A15]/20">
          +{total} А$
        </Badge>
      </div>

      {feed.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Очікуємо перші покупки на ярмарку</p>
      ) : (
        <ul className="space-y-1.5">
          {feed.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-border/40 bg-surface-1/40 p-2.5 animate-fade-in text-xs"
            >
              <div className="min-w-0 pr-2">
                <p className="font-bold text-foreground truncate">{r.child_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Команда №{r.team_number} · {time(r.created_at)}
                </p>
              </div>
              <span className="font-mono font-bold text-emerald-500 text-sm shrink-0">
                +{r.amount} А$
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
});
LiveReceiptsFeed.displayName = 'LiveReceiptsFeed';

/* ------------------------------ Картка успіху -------------------------------- */

interface SuccessToast { id: string; name: string; team: number; amount: number }

const PaymentSuccessCard = memo(({ toast }: { toast: SuccessToast | null }) => (
  <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex justify-center">
    {toast && (
      <div
        key={toast.id}
        className="animate-scale-in flex items-center gap-3 rounded-2xl border border-emerald-500/50 bg-emerald-950/95 px-4 py-3 text-emerald-100 shadow-[0_12px_40px_rgba(16,185,129,0.35)] backdrop-blur-2xl"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md">
          <Check className="h-5 w-5 stroke-[3]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold font-mono text-emerald-300">+{toast.amount} А$ отримано!</p>
          <p className="truncate text-xs opacity-90">
            {toast.name} (Команда №{toast.team})
          </p>
        </div>
      </div>
    )}
  </div>
));
PaymentSuccessCard.displayName = 'PaymentSuccessCard';

/* =========================================================================
   ГОЛОВНИЙ ЕКРАН КАСИРА ЯРМАРКУ
========================================================================= */

const SupervisorFairView = ({ myTeam, isLive = true }: Props) => {
  const [amount, setAmount] = useState<number>(FAIR_PRESETS[2]);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<SuccessToast | null>(null);
  const [allowOtherTeams, setAllowOtherTeams] = useState(false);
  const [standTotal, setStandTotal] = useState(0);
  const [pushQueue, setPushQueue] = useState<PushPaymentRequest[]>([]);
  const [processingPushId, setProcessingPushId] = useState<string | null>(null);

  const [, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const seenRef = useRef<Set<string>>(new Set());
  const haptics = useHaptics();

  const deferredAmount = useDeferredValue(amount);
  const deferredNonce = useDeferredValue(nonce);
  const stale = deferredAmount !== amount || deferredNonce !== nonce;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Завантаження налаштувань дозволу інших команд
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

  // Загальна каса стенду
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    supabase
      .from('fair_payments')
      .select('amount')
      .eq('supervisor_user_id', userId)
      .then(({ data }) => {
        if (!mounted) return;
        setStandTotal((data || []).reduce((s, r: { amount: number }) => s + Math.abs(r.amount), 0));
      });
    return () => { mounted = false; };
  }, [userId]);

  const payload = useMemo<FairQrPayload | null>(() => {
    if (!Number.isFinite(deferredAmount) || deferredAmount <= 0) return null;
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

  const pushReceipt = useCallback((row: FeedRow) => {
    const key = `${row.child_name}:${row.amount}:${Math.round(new Date(row.created_at).getTime() / 2000)}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);

    startTransition(() => setNonce((n) => n + 1));
    setStandTotal((t) => t + Math.abs(row.amount));
    haptics.notification('success');
    setToast({ id: row.id, name: row.child_name, team: row.team_number, amount: row.amount });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), SUCCESS_CARD_MS);
    setFeed((prev) => [row, ...prev.slice(0, FEED_LIMIT - 1)]);
  }, [haptics]);

  // 1. СЛУХАЧ ВХІДНИХ PUSH-ЗАПИТІВ НА КАСУ (AIR PAY)
  useEffect(() => {
    if (myTeam === null || myTeam === undefined) return;

    const teamPushChannel = supabase
      .channel(`supervisor_fair_team_${myTeam}`)
      .on('broadcast', { event: 'FAIR_PUSH_REQUEST' }, (eventPayload) => {
        const req = eventPayload?.payload as PushPaymentRequest;
        if (!req?.requestId) return;

        haptics.notification('warning');

        setPushQueue((prev) => {
          if (prev.some((p) => p.requestId === req.requestId)) return prev;
          return [req, ...prev];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(teamPushChannel);
    };
  }, [myTeam, haptics]);

  // 2. ПІДТВЕРДЖЕННЯ PUSH-ЗАПИТУ СУПРОВОДОМ
  const handleApprovePush = async (req: PushPaymentRequest) => {
    setProcessingPushId(req.requestId);
    haptics.impact('medium');

    const txId = `air_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      // Виконуємо списання коштів
      const { data, error: rpcErr } = await supabase.rpc('pay_fair_purchase', {
        p_tx_id: txId,
        p_amount: req.amount,
        p_supervisor_id: userId,
        p_supervisor_team: myTeam,
        p_label: `Покупка на касі №${myTeam}`,
      });

      if (rpcErr) throw rpcErr;

      // Сповіщаємо дитину про успішну оплату через її персональний канал
      const responseChannel = supabase.channel(`fair_push_response_${req.requestId}`);
      await responseChannel.subscribe();
      await responseChannel.send({
        type: 'broadcast',
        event: 'FAIR_PUSH_CONFIRMED',
        payload: {
          requestId: req.requestId,
          newBalance: (data as { balance_after?: number })?.balance_after,
          amount: req.amount,
        },
      });
      supabase.removeChannel(responseChannel);

      // Додаємо в журнал
      pushReceipt({
        id: txId,
        child_name: req.childName,
        team_number: req.childTeam,
        amount: req.amount,
        created_at: new Date().toISOString(),
      });

      // Видаляємо з черги
      setPushQueue((prev) => prev.filter((p) => p.requestId !== req.requestId));
    } catch (err) {
      console.error('Помилка підтвердження платежу:', err);
      // Сповіщаємо про відхилення
      const responseChannel = supabase.channel(`fair_push_response_${req.requestId}`);
      await responseChannel.subscribe();
      await responseChannel.send({
        type: 'broadcast',
        event: 'FAIR_PUSH_REJECTED',
        payload: { requestId: req.requestId, reason: 'Помилка списання або недостатньо коштів' },
      });
      supabase.removeChannel(responseChannel);
      setPushQueue((prev) => prev.filter((p) => p.requestId !== req.requestId));
    } finally {
      setProcessingPushId(null);
    }
  };

  // 3. ВІДХИЛЕННЯ PUSH-ЗАПИТУ СУПРОВОДОМ
  const handleRejectPush = async (req: PushPaymentRequest) => {
    haptics.impact('light');
    const responseChannel = supabase.channel(`fair_push_response_${req.requestId}`);
    await responseChannel.subscribe();
    await responseChannel.send({
      type: 'broadcast',
      event: 'FAIR_PUSH_REJECTED',
      payload: { requestId: req.requestId, reason: 'Супровід відхилив запит' },
    });
    supabase.removeChannel(responseChannel);

    setPushQueue((prev) => prev.filter((p) => p.requestId !== req.requestId));
  };

  // Слухач платежів через таблиці та інші канали
  useEffect(() => {
    if (!userId) return;
    let mounted = true;

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

    const ch = supabase
      .channel(`supervisor_iron_txs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'iron_dollar_transactions',
        filter: `supervisor_user_id=eq.${userId}`,
      }, async (p) => {
        const tx = p.new as { id: string; child_id: string; amount_change: number; created_at: string };
        try {
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
        } catch (err) {
          console.error(err);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [userId, pushReceipt]);

  // Збереження короткого PIN-коду
  useEffect(() => {
    if (!payload || !userId) return;
    let cancelled = false;
    (async () => {
      const { error: insertErr } = await supabase.from('fair_short_codes').insert({
        code: payload.code,
        supervisor_user_id: userId,
        supervisor_team: myTeam,
        amount: payload.amount,
        tx_id: payload.tx_id,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });
      if (!cancelled && insertErr && (insertErr as { code?: string }).code === '23505') {
        setNonce((n) => n + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [payload, userId, myTeam]);

  if (!userId || myTeam === null || myTeam === undefined) {
    return (
      <div className="p-8 text-center text-sm font-medium text-muted-foreground">
        Завантаження даних каси та команди...
      </div>
    );
  }

  return (
    <div className="space-y-3.5 select-none">
      <PaymentSuccessCard toast={toast} />

      {/* Статус завершення ярмарку */}
      {!isLive && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/10 rounded-2xl">
          <p className="text-sm font-bold text-foreground tracking-tight">Торгівлю на ярмарку завершено</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Нижче наведено підсумкову касу стенду та журнал чеків за зміну.
          </p>
        </Card>
      )}

      {/* Загальна каса стенду */}
      <Card className="p-4 sm:p-5 border-border/60 bg-card/85 backdrop-blur-xl rounded-3xl shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground tracking-tight">Каса стенду</p>
              <p className="text-[11px] text-muted-foreground">Усього зароблено на ярмарку</p>
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#FA5A15]">{standTotal} А$</p>
        </div>
      </Card>

      {/* =========================================================================
          ВХІДНІ PUSH-ЗАПИТИ НА ОПЛАТУ (AIR PAY) В РЕАЛЬНОМУ ЧАСІ
      ========================================================================= */}
      {isLive && pushQueue.length > 0 && (
        <div className="space-y-2 animate-slide-up">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#FA5A15] uppercase tracking-wider">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>Вхідні запити на оплату ({pushQueue.length})</span>
            </div>
          </div>

          <div className="space-y-2">
            {pushQueue.map((req) => (
              <Card 
                key={req.requestId} 
                className="p-4 border-[#FA5A15]/40 bg-gradient-to-r from-[#FA5A15]/10 via-card to-card rounded-2xl shadow-lg animate-scale-in space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-foreground truncate">{req.childName}</p>
                    <p className="text-xs text-muted-foreground font-semibold">
                      Команда №{req.childTeam}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-2xl font-black text-[#FA5A15] tabular-nums">
                      {req.amount} А$
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => handleRejectPush(req)}
                    disabled={processingPushId === req.requestId}
                    className="h-10 text-xs font-bold border-border/60 hover:bg-muted/50 rounded-xl"
                  >
                    <XCircle className="w-4 h-4 mr-1.5 text-destructive" />
                    Відхилити
                  </Button>

                  <Button
                    onClick={() => handleApprovePush(req)}
                    disabled={processingPushId === req.requestId}
                    className="h-10 text-xs font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl shadow-md"
                  >
                    {processingPushId === req.requestId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Списати {req.amount} А$
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Термінал оплати */}
      {isLive && (
        <Card className="p-4 sm:p-5 border-border/60 bg-card/85 backdrop-blur-xl rounded-3xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <h2 className="text-sm font-bold text-foreground tracking-tight">Касовий термінал</h2>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              КАСА ВІДКРИТА
            </span>
          </div>

          <PresetSelector value={amount} custom={!!custom} onPick={applyPreset} />

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                inputMode="numeric"
                placeholder="Власна сума..."
                value={custom}
                onChange={(e) => applyCustom(e.target.value)}
                className="h-11 pr-10 text-sm font-semibold bg-surface-1/50 border-border/60 rounded-xl"
              />
              <span className="absolute right-3 top-3 text-xs font-bold text-muted-foreground">А$</span>
            </div>
            <Button
              variant="outline"
              className="h-11 w-11 p-0 rounded-xl border-border/60 hover:bg-muted/40 shrink-0"
              onClick={() => { haptics.impact('light'); setNonce((n) => n + 1); }}
              title="Оновити QR"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" strokeWidth={1.9} />
            </Button>
          </div>
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}

          <QrDisplay payload={payload} amount={amount} stale={stale} />
        </Card>
      )}

      {isLive && <FairHowTo variant="supervisor" />}

      {/* Дозвіл для інших команд */}
      {isLive && (
        <Card className="p-4 border-border/50 bg-card/85 backdrop-blur-xl rounded-2xl shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Users className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <div className="min-w-0">
                <Label htmlFor="allow-other-teams" className="text-xs sm:text-sm font-bold text-foreground cursor-pointer">
                  Дозволити покупки іншим командам
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
      )}

      {/* Журнал покупок */}
      <LiveReceiptsFeed feed={feed} />
    </div>
  );
};

export default SupervisorFairView;
