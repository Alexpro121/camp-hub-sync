import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Check, 
  Coins, 
  ShoppingBag, 
  Receipt, 
  Users, 
  Wallet, 
  Radio, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  UserCheck,
  Search
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
import { toast } from 'sonner';

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

interface TeamChild {
  id: string;
  full_name: string;
  iron_dollars: number;
}

const FEED_LIMIT = 15;
const SUCCESS_CARD_MS = 2500;
const PRESET_AMOUNTS = [10, 20, 50, 100];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

/* ------------------------------ Картка успіху -------------------------------- */

interface SuccessToast { id: string; name: string; team: number; amount: number }

const PaymentSuccessCard = memo(({ toast }: { toast: SuccessToast | null }) => (
  <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex justify-center select-none">
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
   ГОЛОВНИЙ ЕКРАН AIR PAY КАСИРА
========================================================================= */

const SupervisorFairView = ({ myTeam, isLive = true }: Props) => {
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [toastData, setToastData] = useState<SuccessToast | null>(null);
  const [allowOtherTeams, setAllowOtherTeams] = useState(false);
  const [standTotal, setStandTotal] = useState(0);
  
  // Черга Air Pay запитів
  const [pushQueue, setPushQueue] = useState<PushPaymentRequest[]>([]);
  const [processingPushId, setProcessingPushId] = useState<string | null>(null);

  // Резервне пряме списання (якщо у дитини сів телефон)
  const [teamChildren, setTeamChildren] = useState<TeamChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [directAmount, setDirectAmount] = useState<number>(20);
  const [customDirectAmount, setCustomDirectAmount] = useState<string>('');
  const [directBusy, setDirectBusy] = useState<boolean>(false);
  const [searchChild, setSearchChild] = useState<string>('');

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const seenRef = useRef<Set<string>>(new Set());
  const haptics = useHaptics();

  // Отримання ID авторизованого супроводу
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Завантаження дітей своєї команди для швидкого списання
  useEffect(() => {
    if (myTeam === null || myTeam === undefined) return;
    supabase
      .from('children')
      .select('id, full_name, iron_dollars')
      .eq('team_number', myTeam)
      .order('full_name')
      .then(({ data }) => {
        setTeamChildren((data || []) as TeamChild[]);
      });
  }, [myTeam]);

  // Завантаження налаштувань дозволу покупок іншим командам
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    supabase
      .from('fair_settings')
      .select('allow_other_teams')
      .eq('supervisor_user_id', userId)
      .maybeSingle()
      .then(({ data }) => { 
        if (mounted && data) setAllowOtherTeams(!!data.allow_other_teams); 
      });
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

  // Загальна виручка каси стенду
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

  const pushReceipt = useCallback((row: FeedRow) => {
    const key = `${row.child_name}:${row.amount}:${Math.round(new Date(row.created_at).getTime() / 2000)}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);

    setStandTotal((t) => t + Math.abs(row.amount));
    haptics.notification('success');
    setToastData({ id: row.id, name: row.child_name, team: row.team_number, amount: row.amount });
    
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastData(null), SUCCESS_CARD_MS);
    setFeed((prev) => [row, ...prev.slice(0, FEED_LIMIT - 1)]);
  }, [haptics]);

  // 1. СЛУХАЧ ВХІДНИХ AIR PAY ЗАПИТІВ У РЕАЛЬНОМУ ЧАСІ
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

  // 2. ПІДТВЕРДЖЕННЯ AIR PAY ЗАПИТУ
  const handleApprovePush = async (req: PushPaymentRequest) => {
    setProcessingPushId(req.requestId);
    haptics.impact('medium');

    const txId = `air_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const { data, error: rpcErr } = await supabase.rpc('pay_fair_purchase', {
        p_tx_id: txId,
        p_amount: req.amount,
        p_supervisor_id: userId,
        p_supervisor_team: myTeam,
        p_label: `Air Pay · Каса №${myTeam}`,
      });

      if (rpcErr) throw rpcErr;

      // Сповіщаємо дитину про миттєвий успіх
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

      pushReceipt({
        id: txId,
        child_name: req.childName,
        team_number: req.childTeam,
        amount: req.amount,
        created_at: new Date().toISOString(),
      });

      setPushQueue((prev) => prev.filter((p) => p.requestId !== req.requestId));
      toast.success(`Списано ${req.amount} А$ з балансу ${req.childName}`);
    } catch (err) {
      console.error('Помилка списання:', err);
      const responseChannel = supabase.channel(`fair_push_response_${req.requestId}`);
      await responseChannel.subscribe();
      await responseChannel.send({
        type: 'broadcast',
        event: 'FAIR_PUSH_REJECTED',
        payload: { requestId: req.requestId, reason: 'Помилка списання або недостатній баланс' },
      });
      supabase.removeChannel(responseChannel);
      
      setPushQueue((prev) => prev.filter((p) => p.requestId !== req.requestId));
      toast.error('Не вдалося списати кошти');
    } finally {
      setProcessingPushId(null);
    }
  };

  // 3. ВІДХИЛЕННЯ AIR PAY ЗАПИТУ
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
    toast.info('Запит відхилено');
  };

  // 4. РЕЗЕРВНЕ ПРЯМЕ СПИСАННЯ СУПРОВОДОМ (БЕЗ ТЕЛЕФОНУ ДИТИНИ)
  const handleDirectCharge = async () => {
    if (!selectedChildId) {
      toast.error('Оберіть дитину зі списку');
      return;
    }
    const finalAmount = customDirectAmount ? parseInt(customDirectAmount, 10) || 0 : directAmount;
    if (finalAmount <= 0) {
      toast.error('Введіть коректну суму');
      return;
    }

    const targetChild = teamChildren.find((c) => c.id === selectedChildId);
    if (!targetChild) return;

    if (finalAmount > targetChild.iron_dollars) {
      toast.error(`У дитини лише ${targetChild.iron_dollars} А$ на балансі`);
      return;
    }

    setDirectBusy(true);
    haptics.impact('medium');

    const txId = `direct_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const { error } = await supabase.rpc('pay_fair_purchase', {
        p_tx_id: txId,
        p_amount: finalAmount,
        p_supervisor_id: userId,
        p_supervisor_team: myTeam,
        p_label: `Каса №${myTeam} (Пряме списання)`,
      });

      if (error) throw error;

      pushReceipt({
        id: txId,
        child_name: targetChild.full_name,
        team_number: myTeam || 0,
        amount: finalAmount,
        created_at: new Date().toISOString(),
      });

      // Оновлюємо локальний баланс у списку
      setTeamChildren((prev) =>
        prev.map((c) => (c.id === selectedChildId ? { ...c, iron_dollars: c.iron_dollars - finalAmount } : c))
      );

      setSelectedChildId('');
      setCustomDirectAmount('');
      toast.success(`Успішно списано ${finalAmount} А$ (${targetChild.full_name})`);
    } catch (err: any) {
      toast.error(err?.message || 'Помилка списання');
    } finally {
      setDirectBusy(false);
    }
  };

  // Слухач чеків
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

  const filteredChildren = useMemo(() => {
    if (!searchChild.trim()) return teamChildren;
    return teamChildren.filter((c) => c.full_name.toLowerCase().includes(searchChild.toLowerCase()));
  }, [teamChildren, searchChild]);

  if (!userId || myTeam === null || myTeam === undefined) {
    return (
      <div className="p-8 text-center text-sm font-medium text-muted-foreground select-none">
        Завантаження Air Pay каси...
      </div>
    );
  }

  return (
    <div className="space-y-3.5 select-none">
      <PaymentSuccessCard toast={toastData} />

      {/* Статус ярмарку */}
      {!isLive && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/10 rounded-2xl">
          <p className="text-sm font-bold text-foreground tracking-tight">Торгівлю на ярмарку завершено</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Нижче наведено виручку стенду та повний журнал операцій Air Pay.
          </p>
        </Card>
      )}

      {/* 1. БАНЕР КАСИ ТА ЗАГАЛЬНОЇ ВИРУЧКИ */}
      <Card className="p-4 sm:p-5 border-border/60 bg-card/85 backdrop-blur-xl rounded-3xl shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground tracking-tight">Каса стенду</p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[9px] font-bold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Air Pay Активний
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">Каса Команди №{myTeam} на ярмарку</p>
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#FA5A15]">{standTotal} А$</p>
        </div>
      </Card>

      {/* =========================================================================
          2. ЖИВА ЧЕРГА ВХІДНИХ AIR PAY ЗАПИТІВ ВІД ДІТЕЙ
      ========================================================================= */}
      {isLive && (
        <Card className="p-4 sm:p-5 border-[#FA5A15]/30 bg-gradient-to-b from-[#FA5A15]/[0.06] via-card/85 to-card/85 backdrop-blur-xl rounded-3xl shadow-md space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center text-[#FA5A15]">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Прийом оплат Air Pay</h3>
                <p className="text-[10px] text-muted-foreground">Діти відправляють запити зі своїх телефонів</p>
              </div>
            </div>

            <Badge variant="outline" className="font-mono text-[10px] font-bold border-[#FA5A15]/40 text-[#FA5A15]">
              {pushQueue.length} у черзі
            </Badge>
          </div>

          {pushQueue.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-xs font-bold text-foreground">Очікування покупців...</p>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                Повідомте дітям номер своєї каси: <strong className="text-foreground">№{myTeam}</strong>. Вони надсилають суму в 1 клік.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1">
              {pushQueue.map((req) => (
                <div
                  key={req.requestId}
                  className="p-3.5 sm:p-4 border border-[#FA5A15]/50 bg-gradient-to-r from-[#FA5A15]/15 via-card/95 to-card/95 rounded-2xl shadow-lg space-y-3 animate-scale-in"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FA5A15] block">
                        Новий запит
                      </span>
                      <p className="text-base font-bold text-foreground truncate">{req.childName}</p>
                      <p className="text-xs text-muted-foreground font-semibold">
                        Команда №{req.childTeam}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-2xl sm:text-3xl font-black text-[#FA5A15] tabular-nums">
                        {req.amount} А$
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => handleRejectPush(req)}
                      disabled={processingPushId === req.requestId}
                      className="h-11 text-xs font-bold border-border/60 hover:bg-muted/60 rounded-xl"
                    >
                      <XCircle className="w-4 h-4 mr-1.5 text-destructive" />
                      Відхилити
                    </Button>

                    <Button
                      onClick={() => handleApprovePush(req)}
                      disabled={processingPushId === req.requestId}
                      className="h-11 text-xs font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl shadow-md active:scale-95 transition-all"
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
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* =========================================================================
          3. РЕЗЕРВНИЙ КАНАЛ: ПРЯМЕ СПИСАННЯ (ЯКЩО У ДИТИНИ НЕМАЄ ЗВ'ЯЗКУ)
      ========================================================================= */}
      {isLive && (
        <Card className="p-4 sm:p-5 border-border/60 bg-card/85 backdrop-blur-xl rounded-3xl shadow-sm space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-foreground">Пряме списання (ручний режим)</h3>
            </div>
            <span className="text-[10px] text-muted-foreground">Без телефону дитини</span>
          </div>

          {/* Пошук та вибір дитини */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-3" />
              <Input
                placeholder="Пошук учасника своєї команди..."
                value={searchChild}
                onChange={(e) => setSearchChild(e.target.value)}
                className="pl-8 h-9 text-xs bg-surface-1/50 border-border/60 rounded-xl"
              />
            </div>

            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {filteredChildren.map((c) => {
                const isSelected = selectedChildId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setSelectedChildId(isSelected ? '' : c.id);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-sky-500/20 border-sky-500/50 text-white'
                        : 'bg-surface-1/40 hover:bg-muted/50 border-border/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="truncate">{c.full_name}</span>
                    <span className="font-mono text-[11px] text-primary">{c.iron_dollars} А$</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Вибір суми прямого списання */}
          {selectedChildId && (
            <div className="space-y-2.5 pt-2 border-t border-border/40 animate-fade-in">
              <div className="grid grid-cols-4 gap-1.5">
                {PRESET_AMOUNTS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      haptics.impact('light');
                      setCustomDirectAmount('');
                      setDirectAmount(val);
                    }}
                    className={`h-10 rounded-xl font-mono text-xs font-bold transition-all border ${
                      directAmount === val && !customDirectAmount
                        ? 'bg-[#FA5A15] border-[#FA5A15] text-white shadow-sm'
                        : 'bg-surface-1/60 hover:bg-muted/60 border-border/50 text-foreground'
                    }`}
                  >
                    {val} А$
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Інша сума..."
                  value={customDirectAmount}
                  onChange={(e) => setCustomDirectAmount(e.target.value.replace(/[^\d]/g, ''))}
                  className="h-10 text-xs bg-surface-1/50 border-border/60 rounded-xl"
                />
                
                <Button
                  onClick={handleDirectCharge}
                  disabled={directBusy}
                  className="h-10 px-4 text-xs font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl shadow-md active:scale-95 shrink-0"
                >
                  {directBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Списати'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 4. ДОЗВІЛ ДЛЯ ІНШИХ КОМАНД */}
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
                    ? 'Купувати на цій касі можуть діти з будь-якої команди'
                    : `Купувати можуть лише діти вашої Команди №${myTeam ?? '—'}`}
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

      <FairHowTo variant="supervisor" />

      {/* 5. ЖУРНАЛ ОПЕРАЦІЙ AIR PAY */}
      <Card className="p-4 border-border/50 bg-card/85 backdrop-blur-xl rounded-3xl shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="text-sm font-bold tracking-tight text-foreground">Журнал покупок (Air Pay)</h3>
          </div>
          <Badge variant="secondary" className="font-mono text-xs font-bold text-[#FA5A15] bg-[#FA5A15]/10 border-[#FA5A15]/20">
            +{standTotal} А$
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
    </div>
  );
};

export default SupervisorFairView;
