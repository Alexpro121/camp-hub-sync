import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, QrCode, Smartphone, ShieldCheck, Timer, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { toast } from 'sonner';
import QrSvg from '@/components/fair/QrSvg';
import { useHaptics } from '@/hooks/useHaptics';
import {
  hostPassportBridge,
  claimPassportBridge,
  type BridgeHostHandle,
} from '@/lib/alumniBridge';
import {
  saveAlumniPassport,
  migratePassport,
  type AlumniPassportEnvelope,
} from '@/lib/alumniPassport';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Паспорт на цьому пристрої (для режиму передачі) */
  passport?: AlumniPassportEnvelope | null;
  /** Режим за замовчуванням: віддати чи прийняти */
  defaultMode?: 'send' | 'receive';
  /** Викликається після успішного прийому паспорта */
  onReceived?: (passport: AlumniPassportEnvelope) => void;
}

const formatLeft = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** Ефемерне перенесення офлайн-паспорта випускника між пристроями (0 байтів на сервері) */
export const DeviceSyncModal = ({ open, onClose, passport, defaultMode = 'send', onReceived }: Props) => {
  const haptics = useHaptics();
  const [mode, setMode] = useState<'send' | 'receive'>(defaultMode);
  const [pin, setPin] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [leftMs, setLeftMs] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const hostRef = useRef<BridgeHostHandle | null>(null);
  const claimRef = useRef<{ cancel: () => void } | null>(null);

  const stopAll = useCallback(() => {
    hostRef.current?.close();
    hostRef.current = null;
    claimRef.current?.cancel();
    claimRef.current = null;
    setWaiting(false);
    setPin('');
    setLeftMs(0);
  }, []);

  useEffect(() => {
    if (!open) stopAll();
    else setMode(defaultMode);
  }, [open, defaultMode, stopAll]);

  useEffect(() => () => stopAll(), [stopAll]);

  // Таймер життя кімнати
  useEffect(() => {
    if (!pin || !hostRef.current) return;
    const expiresAt = hostRef.current.expiresAt;
    const tick = () => setLeftMs(expiresAt - Date.now());
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [pin]);

  const startHosting = () => {
    if (!passport) {
      toast.error('На цьому пристрої немає паспорта для передачі');
      return;
    }
    haptics.impact('medium');
    const handle = hostPassportBridge(passport, {
      onSent: () => {
        haptics.notification('success');
        toast.success('Паспорт передано на новий пристрій');
      },
      onExpired: () => {
        setPin('');
        toast.message('Код перенесення завершився');
      },
    });
    hostRef.current = handle;
    setPin(handle.pin);
  };

  const startClaiming = async () => {
    const clean = inputPin.replace(/\D/g, '');
    if (clean.length !== 6) {
      toast.error('Введіть 6-значний код зі старого телефону');
      return;
    }
    setWaiting(true);
    haptics.impact('light');
    const claim = claimPassportBridge(clean);
    claimRef.current = claim;
    const result = await claim.promise;
    claimRef.current = null;
    setWaiting(false);

    if (result.status !== 'ok' || !result.passport) {
      haptics.notification('error');
      toast.error('Старий пристрій не відповів. Перевірте код і тримайте обидва застосунки відкритими');
      return;
    }

    const migrated = migratePassport(result.passport);
    if (!migrated) {
      toast.error('Отримані дані пошкоджені');
      return;
    }

    await saveAlumniPassport(migrated);
    haptics.notification('success');
    toast.success('Паспорт випускника відновлено на цьому пристрої');
    onReceived?.(migrated);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { stopAll(); onClose(); } }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[88dvh] overflow-y-auto rounded-3xl border border-white/10 bg-[#07090E]/95 backdrop-blur-2xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
            <Smartphone className="w-5 h-5 text-[#FFB800]" />
            Перенесення паспорта
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Дані передаються напряму між пристроями через тимчасовий канал. На сервері не зберігається нічого.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/[0.04] border border-white/10">
          <button
            onClick={() => { stopAll(); setMode('send'); }}
            className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${mode === 'send' ? 'bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black' : 'text-slate-300'}`}
          >
            <ArrowUpFromLine className="w-4 h-4" /> Віддати
          </button>
          <button
            onClick={() => { stopAll(); setMode('receive'); }}
            className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${mode === 'receive' ? 'bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black' : 'text-slate-300'}`}
          >
            <ArrowDownToLine className="w-4 h-4" /> Прийняти
          </button>
        </div>

        {mode === 'send' ? (
          <div className="mt-3 space-y-3">
            {!pin ? (
              <>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Натисніть кнопку нижче на старому телефоні, а на новому оберіть «Прийняти» та введіть код.
                  Код дійсний 3 хвилини.
                </p>
                <Button
                  onClick={startHosting}
                  className="w-full h-12 rounded-2xl font-black bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black hover:opacity-90"
                >
                  <QrCode className="w-4 h-4 mr-2" /> Створити код перенесення
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-2xl bg-white">
                  <QrSvg value={`iron-alumni:${pin}`} size={180} includeLogo={false} />
                </div>
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">Код перенесення</p>
                  <p className="font-mono text-4xl font-black tracking-[0.28em] text-[#FFB800] tabular-nums">{pin}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Timer className="w-3.5 h-3.5" /> {formatLeft(leftMs)}
                </div>
                <Button variant="ghost" onClick={stopAll} className="text-xs text-slate-400">
                  Скасувати перенесення
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Введіть 6-значний код зі старого телефону. Обидва застосунки мають бути відкриті та онлайн.
            </p>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={inputPin}
              onChange={(e) => setInputPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="h-14 text-center font-mono text-3xl font-black tracking-[0.3em] bg-[#0A0E18] border-white/10 text-white rounded-2xl"
            />
            <Button
              onClick={startClaiming}
              disabled={waiting}
              className="w-full h-12 rounded-2xl font-black bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black hover:opacity-90"
            >
              {waiting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Очікуємо старий пристрій…</>) : 'Відновити мій паспорт'}
            </Button>
          </div>
        )}

        <div className="mt-3 flex items-start gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
          <ShieldCheck className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Паспорт зберігається лише на ваших пристроях. Канал закривається одразу після передачі.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeviceSyncModal;
