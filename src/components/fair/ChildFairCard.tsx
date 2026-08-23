import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Coins, 
  ShoppingBag, 
  Send, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Store, 
  Radio, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import { TEAM_MAX } from '@/lib/normalize';
import FairHowTo from './FairHowTo';

interface Props {
  childId?: string;
  balance: number;
  onPaid?: (newBalance: number) => void;
  childName?: string;
  childTeam?: number | null;
}

type PayStatus = 'idle' | 'sending' | 'pending' | 'success' | 'rejected';

const PRESET_AMOUNTS = [5, 10, 15, 20];

const ChildFairCard = ({ childId, balance, onPaid, childName, childTeam }: Props) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(20);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [targetTeam, setTargetTeam] = useState<string>(String(childTeam || 1));
  const numericTargetTeam = Math.min(TEAM_MAX, Math.max(1, parseInt(targetTeam, 10) || 1));
  const [status, setStatus] = useState<PayStatus>('idle');
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  const haptics = useHaptics();
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Фінальна сума до оплати
  const finalAmount = customAmount ? parseInt(customAmount, 10) || 0 : selectedAmount;

  // Realtime слухач відповідей від каси супроводу
  useEffect(() => {
    if (!currentRequestId || status !== 'pending') return;

    const channelName = `fair_push_response_${currentRequestId}`;
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'FAIR_PUSH_CONFIRMED' }, (payload) => {
        const data = payload?.payload;
        if (data?.requestId === currentRequestId) {
          if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
          
          setStatus('success');
          haptics.notification('success');
          
          if (typeof data.newBalance === 'number') {
            onPaid?.(data.newBalance);
          } else {
            onPaid?.(Math.max(0, balance - finalAmount));
          }

          toast.success('Оплату успішно підтверджено супроводом!');
        }
      })
      .on('broadcast', { event: 'FAIR_PUSH_REJECTED' }, (payload) => {
        const data = payload?.payload;
        if (data?.requestId === currentRequestId) {
          if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
          setStatus('rejected');
          haptics.notification('error');
          toast.error(data.reason || 'Супровід відхилив запит на оплату');
        }
      })
      .subscribe();

    // Автоматичний таймаут очікування (45 секунд)
    pendingTimeoutRef.current = setTimeout(() => {
      setStatus('idle');
      setCurrentRequestId(null);
      toast.error('Час очікування підтвердження касиром вичерпано');
    }, 45000);

    return () => {
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [currentRequestId, status, balance, finalAmount, onPaid, haptics]);

  // Відправка Push-запиту на касу супроводу
  const handleSendPaymentRequest = useCallback(async () => {
    if (finalAmount <= 0) {
      toast.error('Вкажіть дійсну суму покупки');
      return;
    }

    if (finalAmount > balance) {
      toast.error(`Недостатньо Айрон-доларів. Ваш баланс: ${balance} А$`);
      return;
    }

    haptics.impact('medium');
    setStatus('sending');

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setCurrentRequestId(requestId);

    try {
      // Відправляємо запит у канал каси відповідної команди супроводу
      const supervisorChannel = supabase.channel(`supervisor_fair_team_${numericTargetTeam}`);
      await supervisorChannel.subscribe();

      await supervisorChannel.send({
        type: 'broadcast',
        event: 'FAIR_PUSH_REQUEST',
        payload: {
          requestId,
          childId,
          childName: childName || 'Учасник',
          childTeam: childTeam ?? 0,
          amount: finalAmount,
          targetTeam: numericTargetTeam,
          timestamp: Date.now(),
        },
      });

      setStatus('pending');
      toast.info(`Запит надіслано на Касу Команди №${targetTeam}`);
    } catch (err) {
      console.error('[ChildFairCard] Помилка відправки запиту:', err);
      setStatus('idle');
      setCurrentRequestId(null);
      toast.error('Не вдалося надіслати запит. Перевірте зʼєднання');
    }
  }, [finalAmount, balance, numericTargetTeam, childId, childName, childTeam, haptics]);

  // Скасування активного запиту дитиною
  const handleCancelRequest = () => {
    if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    haptics.impact('light');
    setStatus('idle');
    setCurrentRequestId(null);
    toast.info('Запит скасовано');
  };

  // Скидання форми після успішної оплати
  const handleReset = () => {
    setStatus('idle');
    setCurrentRequestId(null);
    setCustomAmount('');
  };

  return (
    <>
      <Card className="p-4 sm:p-5 mb-3 border-border/60 bg-card/85 backdrop-blur-xl shadow-md rounded-3xl space-y-4 select-none transition-all">
        
        {/* Шапка картки */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground block">
                Ярмарок сьогодні
              </span>
              <span className="text-xs font-semibold text-foreground">
                Швидка оплата (Air Pay)
              </span>
            </div>
          </div>

          {/* Баланс */}
          <div className="text-right">
            <div className="font-mono text-xl sm:text-2xl font-black text-foreground tabular-nums flex items-baseline justify-end gap-1">
              <span className="text-primary">{balance}</span>
              <span className="text-xs font-sans font-bold text-muted-foreground">А$</span>
            </div>
          </div>
        </div>

        {/* 1. СТАН: ФОРМА ВИБОРУ СУМИ ТА ВІДПРАВКИ */}
        {status === 'idle' && (
          <div className="space-y-3.5 animate-fade-in">
            
            {/* Вибір каси команди */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-primary" />
                <span>Оберіть касу супроводу</span>
              </label>
              
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={targetTeam}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    setTargetTeam(raw);
                  }}
                  onBlur={() => setTargetTeam(String(numericTargetTeam))}
                  className="h-11 font-mono font-bold text-sm bg-surface-1/50 border-border/60 rounded-xl"
                  placeholder="Номер команди"
                />
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                  Команда касира
                </span>
              </div>
            </div>

            {/* Швидкі суми (Presets) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                Сума покупки
              </label>

              <div className="grid grid-cols-4 gap-1.5">
                {PRESET_AMOUNTS.map((val) => {
                  const isSelected = selectedAmount === val && !customAmount;
                  const isTooMuch = val > balance;

                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={isTooMuch}
                      onClick={() => {
                        haptics.impact('light');
                        setCustomAmount('');
                        setSelectedAmount(val);
                      }}
                      className={`h-11 rounded-xl font-mono text-xs sm:text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-0.5 border ${
                        isTooMuch
                          ? 'opacity-30 cursor-not-allowed border-border/30 bg-muted/20 text-muted-foreground'
                          : isSelected
                          ? 'bg-[#FA5A15] border-[#FA5A15] text-white shadow-[0_0_14px_rgba(250,90,21,0.35)]'
                          : 'bg-surface-1/60 hover:bg-muted/60 border-border/50 text-foreground'
                      }`}
                    >
                      <span>{val}</span>
                      <span className="text-[9px] font-sans opacity-80">А$</span>
                    </button>
                  );
                })}
              </div>

              {/* Поле для іншої суми */}
              <div className="relative pt-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Ввести іншу суму..."
                  value={customAmount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setCustomAmount(val);
                  }}
                  className="h-11 pl-9 pr-12 text-sm font-semibold bg-surface-1/50 border-border/60 rounded-xl focus:border-primary"
                />
                <Coins className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5" />
                <span className="absolute right-3.5 top-3 text-xs font-bold text-muted-foreground">А$</span>
              </div>
            </div>

            {/* Головна кнопка відправки запиту */}
            <Button
              onClick={handleSendPaymentRequest}
              disabled={finalAmount <= 0 || finalAmount > balance}
              className="w-full h-13 rounded-2xl text-sm sm:text-base font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 mt-2"
            >
              <Send className="w-4 h-4" />
              <span>Надіслати запит на {finalAmount} А$</span>
            </Button>
          </div>
        )}

        {/* 2. СТАН: ОЧІКУВАННЯ ПІДТВЕРДЖЕННЯ ВІД СУПРОВОДУ */}
        {(status === 'sending' || status === 'pending') && (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
            
            {/* Анімований пульсуючий радар */}
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-20 w-20 rounded-full bg-[#FA5A15]/25 opacity-75" />
              <div className="relative w-16 h-16 rounded-full bg-[#FA5A15]/15 border-2 border-[#FA5A15] flex items-center justify-center text-[#FA5A15] shadow-[0_0_20px_rgba(250,90,21,0.4)]">
                <Radio className="w-8 h-8 animate-pulse" />
              </div>
            </div>

            <div className="space-y-1">
              <p className="font-mono text-2xl font-black text-[#FA5A15]">
                {finalAmount} А$
              </p>
              <h3 className="text-sm font-bold text-foreground">
                Запит надіслано на Касу №{numericTargetTeam}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Повідомте супровід своє ім'я. Очікуємо підтвердження списання...
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleCancelRequest}
              className="h-10 text-xs font-semibold border-border/60 hover:bg-muted/50 rounded-xl active:scale-95"
            >
              Скасувати запит
            </Button>
          </div>
        )}

        {/* 3. СТАН: УСПІШНЕ ПІДТВЕРДЖЕННЯ */}
        {status === 'success' && (
          <div className="py-5 flex flex-col items-center justify-center text-center space-y-3 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]">
              <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-foreground">Оплату здійснено!</h3>
              <p className="font-mono text-xl font-bold text-[#FA5A15]">
                -{finalAmount} А$
              </p>
              <p className="text-xs text-muted-foreground">
                Супровід підтвердив операцію на Касі №{numericTargetTeam}. Гарних покупок!
              </p>
            </div>

            <Button
              onClick={handleReset}
              className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md"
            >
              Нова покупка
            </Button>
          </div>
        )}

        {/* 4. СТАН: ВІДХИЛЕНО */}
        {status === 'rejected' && (
          <div className="py-4 flex flex-col items-center justify-center text-center space-y-3 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive">
              <XCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">Запит відхилено</h3>
              <p className="text-xs text-muted-foreground">
                Супровід відхилив цей платіж. Спробуйте ще раз або зверніться до касира.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleReset}
              className="h-10 text-xs font-semibold rounded-xl"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Спробувати знову
            </Button>
          </div>
        )}

      </Card>

      <FairHowTo variant="child" className="mb-3" />
    </>
  );
};

export default ChildFairCard;
