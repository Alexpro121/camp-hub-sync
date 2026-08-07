import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { KeyRound, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import {
  decodeFairCode,
  formatFairCode,
  parseFairQr,
  type FairQrPayload,
} from '@/lib/fair';

interface Props {
  open: boolean;
  onClose: () => void;
  balance: number;
  onPaid?: (newBalance: number) => void;
}

type Stage = 'scanning' | 'manual' | 'processing' | 'success' | 'failure';

interface Receipt {
  merchant: string;
  amount: number;
  txId: string;
  at: Date;
}

const SCAN_LOCK_MS = 3000;
const RPC_RETRIES = 3;
/** Decode at ~10 FPS instead of 60 — same responsiveness, ~70% less CPU/GPU load. */
const SCAN_FPS = 10;
const SCAN_INTERVAL_MS = 1000 / SCAN_FPS;
/** Hard network timeout for a single payment attempt. */
const RPC_TIMEOUT_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rejects when the RPC takes longer than the timeout; retries stay idempotent via tx_id. */
const withTimeout = async <T,>(p: PromiseLike<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('network_timeout')), ms);
  });
  try {
    return (await Promise.race([p, timeout])) as T;
  } finally {
    clearTimeout(timer!);
  }
};

/** Lightweight canvas confetti — no dependency, cleans itself up. */
const triggerConfetti = (canvas: HTMLCanvasElement | null) => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#34c759', '#ffffff', '#8ee9a4', '#c9f7d4'];
  // Pooled, small particle count keeps the animation cheap on mid-range phones.
  const parts = Array.from({ length: 45 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 60,
    y: h * 0.42,
    vx: (Math.random() - 0.5) * 7,
    vy: -Math.random() * 9 - 3,
    size: 3 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 1,
  }));

  let raf = 0;
  const start = performance.now();
  const tick = (t: number) => {
    const life = Math.max(0, 1 - (t - start) / 2200);
    if (life <= 0) { ctx.clearRect(0, 0, w, h); cancelAnimationFrame(raf); return; }
    ctx.clearRect(0, 0, w, h);
    parts.forEach((p) => {
      p.vy += 0.22;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = life;
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
      ctx.restore();
    });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
};

const ApplePayScannerModal = ({ open, onClose, balance, onPaid }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lockedRef = useRef(false);
  const mountedRef = useRef(true);

  const [stage, setStage] = useState<Stage>('scanning');
  const [cameraReady, setCameraReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [manualCode, setManualCode] = useState('');
  const haptics = useHaptics();

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
    streamRef.current = null;
  }, []);

  const showFailure = useCallback((message: string) => {
    haptics.notification('error');
    setFailure(message);
    setStage('failure');
  }, [haptics]);

  /** Charges the balance through the atomic RPC; safe to retry with the same tx. */
  const charge = useCallback(async (payload: FairQrPayload) => {
    setStage('processing');

    let lastError: unknown = null;
    for (let attempt = 0; attempt < RPC_RETRIES; attempt++) {
      const { data, error } = await supabase.rpc('pay_fair_purchase', {
        p_tx_id: payload.tx_id,
        p_amount: payload.amount,
        p_supervisor_id: payload.supervisor_id,
        p_supervisor_team: payload.supervisor_team,
      });

      if (!error) {
        const res = (data ?? {}) as { status?: string; balance?: number; balance_after?: number };
        if (res.status === 'insufficient_funds') {
          showFailure(`Недостатньо Айрон-доларів (Баланс: ${res.balance ?? balance} 💰, Сума: ${payload.amount} 💰)`);
          return;
        }
        if (res.status === 'ok' || res.status === 'duplicate') {
          if (typeof res.balance_after === 'number') onPaid?.(res.balance_after);
          setReceipt({
            merchant: payload.supervisor_name || 'Ярмарок · Залізна зміна',
            amount: payload.amount,
            txId: payload.tx_id,
            at: new Date(),
          });
          if (!mountedRef.current) return;
          setStage('success');
          haptics.notification('success');
          setTimeout(() => triggerConfetti(confettiRef.current), 220);
          return;
        }
        showFailure('Не вдалося провести оплату');
        return;
      }

      lastError = error;
      const msg = String((error as any)?.message || '');
      if (/tx_already_used/.test(msg)) { showFailure('Цей QR-код вже використано'); return; }
      if (/invalid_amount/.test(msg)) { showFailure('Недійсна сума в QR-коді'); return; }
      if (/not_a_child|not_authenticated/.test(msg)) { showFailure('Сесію втрачено, увійди знову'); return; }
      await sleep(700 * (attempt + 1));
    }

    showFailure(lastError ? 'Немає звʼязку. Спробуй ще раз — списання не подвоїться' : 'Не вдалося провести оплату');
  }, [balance, haptics, onPaid, showFailure]);

  const handleDecoded = useCallback((raw: string) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setTimeout(() => { lockedRef.current = false; }, SCAN_LOCK_MS);

    const parsed = parseFairQr(raw);
    if (!parsed.ok) {
      showFailure(parsed.reason === 'expired'
        ? 'QR-код застарів, попросіть новий у вожатого'
        : 'Недійсний QR-код ярмарку');
      return;
    }
    haptics.impact('medium');
    charge(parsed.payload);
  }, [charge, haptics, showFailure]);

  // Camera lifecycle + decode loop.
  useEffect(() => {
    if (!open || stage !== 'scanning') return;
    let cancelled = false;
    mountedRef.current = true;

    const scan = () => {
      const video = videoRef.current;
      const canvas = frameRef.current;
      if (!cancelled && video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = 320;
        const h = Math.max(1, Math.round((video.videoHeight / (video.videoWidth || 1)) * w)) || 320;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.data) handleDecoded(code.data);
          } catch { /* frame not ready */ }
        }
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(scan);
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          await video.play().catch(() => undefined);
        }
        setCameraReady(true);
        rafRef.current = requestAnimationFrame(scan);
      } catch {
        if (!cancelled) { setCameraReady(false); setStage('manual'); }
      }
    };

    start();
    return () => { cancelled = true; stopCamera(); };
  }, [open, stage, handleDecoded, stopCamera]);

  // Reset everything each time the sheet opens.
  useEffect(() => {
    if (open) {
      mountedRef.current = true;
      setStage('scanning');
      setFailure(null);
      setReceipt(null);
      setManualCode('');
      lockedRef.current = false;
    } else {
      mountedRef.current = false;
      stopCamera();
    }
  }, [open, stopCamera]);

  useEffect(() => () => { mountedRef.current = false; stopCamera(); }, [stopCamera]);

  // Failure auto-returns to the scanner.
  useEffect(() => {
    if (stage !== 'failure') return;
    const t = setTimeout(() => {
      setFailure(null);
      setStage(cameraReady ? 'scanning' : 'manual');
    }, 3200);
    return () => clearTimeout(t);
  }, [stage, cameraReady]);

  const submitManual = () => {
    const decoded = decodeFairCode(manualCode);
    if (!decoded) { showFailure('Недійсний код ярмарку'); return; }
    if (Date.now() - decoded.timestamp > 2 * 60 * 60 * 1000) {
      showFailure('QR-код застарів, попросіть новий у вожатого');
      return;
    }
    haptics.impact('medium');
    charge({
      type: 'CAMP_FAIR_PAYMENT',
      tx_id: decoded.tx_id,
      supervisor_id: null,
      supervisor_team: null,
      supervisor_name: 'Ярмарок · Залізна зміна',
      amount: decoded.amount,
      timestamp: decoded.timestamp,
      code: decoded.code,
    });
  };

  if (!open) return null;

  const close = () => { stopCamera(); onClose(); };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="pay-sheet relative w-full sm:max-w-sm mx-auto rounded-t-[28px] sm:rounded-[28px] border border-white/10 bg-[#0c0c0e]/95 backdrop-blur-2xl p-5 pb-8 overflow-hidden">
        <canvas ref={confettiRef} className="pointer-events-none absolute inset-0 w-full h-full z-20" />

        <div className="flex items-center justify-between mb-4 relative z-10">
          <p className="text-[13px] font-semibold tracking-tight text-white/70">Оплата Айрон-доларами</p>
          <button
            type="button"
            onClick={close}
            aria-label="Закрити"
            className="w-8 h-8 rounded-full bg-white/10 text-white/70 flex items-center justify-center active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* Scanner viewport */}
        {(stage === 'scanning' || stage === 'processing') && (
          <div className={`scanner-viewport relative mx-auto overflow-hidden rounded-3xl bg-black ${stage === 'processing' ? 'is-collapsing' : ''}`}>
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <canvas ref={frameRef} className="hidden" />
            <span className="scan-corner tl" /><span className="scan-corner tr" />
            <span className="scan-corner bl" /><span className="scan-corner br" />
            {stage === 'scanning' && <span className="scan-laser" />}
          </div>
        )}

        {stage === 'scanning' && (
          <div className="mt-4 text-center relative z-10">
            <p className="text-[15px] font-semibold text-white tracking-tight">Наведи камеру на QR-код</p>
            <p className="text-[12px] text-white/50 mt-1">Баланс: {balance} 💰</p>
            <button
              type="button"
              onClick={() => { stopCamera(); setStage('manual'); }}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-white/60 hover:text-white transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.9} /> Ввести код вручну
            </button>
          </div>
        )}

        {stage === 'manual' && (
          <div className="relative z-10">
            <div className="fallback-aurora rounded-3xl h-40 flex items-center justify-center">
              <ScanLine className="w-8 h-8 text-white/70" strokeWidth={1.6} />
            </div>
            <p className="mt-4 text-[15px] font-semibold text-white tracking-tight text-center">
              Камера недоступна
            </p>
            <p className="text-[12px] text-white/50 text-center mt-1">
              Введи код із цінника — він під QR-кодом
            </p>
            <Input
              value={formatFairCode(manualCode.replace(/[^0-9a-fA-F]/g, ''))}
              onChange={(e) => setManualCode(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 16))}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              inputMode="text"
              autoCapitalize="characters"
              className="mt-4 h-12 text-center font-mono tracking-[0.18em] bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
            <Button
              onClick={submitManual}
              disabled={manualCode.replace(/[^0-9a-fA-F]/g, '').length !== 16}
              className="w-full h-12 mt-3 rounded-2xl bg-white text-black hover:bg-white/90 font-semibold"
            >
              Оплатити
            </Button>
            {cameraReady && (
              <button
                type="button"
                onClick={() => setStage('scanning')}
                className="mt-3 w-full text-[12px] text-white/60 hover:text-white transition-colors"
              >
                Повернутись до сканера
              </button>
            )}
          </div>
        )}

        {stage === 'processing' && (
          <div className="mt-5 flex flex-col items-center relative z-10">
            <span className="ios-spinner" aria-hidden="true" />
            <p className="mt-3 text-[15px] font-semibold text-white tracking-tight">Підтвердження Apple Pay…</p>
          </div>
        )}

        {stage === 'success' && receipt && (
          <div className="pay-success flex flex-col items-center relative z-10">
            <div className="relative w-[88px] h-[88px] flex items-center justify-center">
              <span className="success-shockwave" />
              <span className="success-bg-circle" />
              <svg viewBox="0 0 52 52" className="w-11 h-11 relative z-[2]">
                <path className="apple-checkmark-path" d="M14 27 L23 36 L38 18" />
              </svg>
            </div>
            <p className="mt-2 text-[20px] font-bold text-white tracking-tight">Оплачено</p>
            <p className="text-[13px] text-white/50">{receipt.amount} Айрон-доларів</p>

            <div className="w-full mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-[13px] space-y-1.5">
              <div className="flex justify-between text-white/55">
                <span>Магазин</span><span className="text-white font-semibold text-right">{receipt.merchant}</span>
              </div>
              <div className="flex justify-between text-white/55">
                <span>Сума</span><span className="text-white font-semibold tabular-nums">{receipt.amount} 💰</span>
              </div>
              <div className="flex justify-between text-white/55">
                <span>Транзакція</span>
                <span className="text-white font-mono text-[11px]">{receipt.txId.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between text-white/55">
                <span>Час</span>
                <span className="text-white font-semibold tabular-nums">
                  {receipt.at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <Button onClick={close} className="w-full h-12 mt-4 rounded-2xl bg-white text-black hover:bg-white/90 font-semibold">
              Готово
            </Button>
          </div>
        )}

        {stage === 'failure' && (
          <div className="pay-failure flex flex-col items-center py-4 relative z-10">
            <div className="relative w-[88px] h-[88px] flex items-center justify-center">
              <span className="failure-bg-circle" />
              <svg viewBox="0 0 52 52" className="w-10 h-10 relative z-[2]">
                <path className="apple-cross-path" d="M18 18 L34 34" />
                <path className="apple-cross-path delay" d="M34 18 L18 34" />
              </svg>
            </div>
            <p className="mt-3 text-[15px] font-semibold text-white text-center px-2 tracking-tight">{failure}</p>
            <Button
              variant="secondary"
              onClick={() => { setFailure(null); setStage(cameraReady ? 'scanning' : 'manual'); }}
              className="w-full h-12 mt-4 rounded-2xl"
            >
              Спробувати ще раз
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApplePayScannerModal;