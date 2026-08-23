import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { KeyRound, ScanLine, X, Coins, Check, AlertCircle, ShoppingBag, Clock, Hash, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useHaptics } from '@/hooks/useHaptics';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import FairHowTo from './FairHowTo';
import {
  FAIR_CODE_LENGTH,
  normalizeFairCode,
  parseFairQr,
  type FairQrPayload,
} from '@/lib/fair';

interface Props {
  open: boolean;
  onClose: () => void;
  balance: number;
  onPaid?: (newBalance: number) => void;
  childName?: string;
  childTeam?: number | null;
}

type Stage = 'scanning' | 'manual' | 'processing' | 'success' | 'failure';

interface Receipt {
  merchant: string;
  amount: number;
  txId: string;
  at: Date;
  label?: string | null;
}

interface FrameBox { x: number; y: number; w: number; h: number }

const SCAN_LOCK_MS = 3000;
const RPC_RETRIES = 3;
/** Декодування камери на 10 FPS для зниження навантаження на процесор на ~70% */
const SCAN_FPS = 10;
const SCAN_INTERVAL_MS = 1000 / SCAN_FPS;
/** Жорсткий таймаут для одного RPC-запиту оплати */
const RPC_TIMEOUT_MS = 5000;
const BOX_UPDATE_MS = 65;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Легке конфеті на Canvas без сторонніх бібліотек */
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

  const colors = ['#FA5A15', '#10B981', '#38BDF8', '#F59E0B', '#FFFFFF'];
  const parts = Array.from({ length: 45 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 60,
    y: h * 0.4,
    vx: (Math.random() - 0.5) * 7,
    vy: -Math.random() * 8 - 3,
    size: 3.5 + Math.random() * 3.5,
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

const ApplePayScannerModal = ({ open, onClose, balance, onPaid, childName, childTeam }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastBoxUpdateRef = useRef(0);
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
  const island = useDynamicIsland();

  const applyBox = useCallback((next: FrameBox | null, now: number) => {
    const el = boxRef.current;
    if (!el) return;
    if (!next) {
      if (el.style.opacity !== '0') el.style.opacity = '0';
      return;
    }
    if (now - lastBoxUpdateRef.current < BOX_UPDATE_MS) return;
    lastBoxUpdateRef.current = now;
    el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
    el.style.width = `${next.w}px`;
    el.style.height = `${next.h}px`;
    el.style.opacity = '1';
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const video = videoRef.current;
    if (video) { 
      try { video.pause(); } catch { /* ignore */ } 
      video.srcObject = null; 
    }
    streamRef.current?.getTracks().forEach((t) => { 
      try { t.stop(); } catch { /* ignore */ } 
    });
    streamRef.current = null;
  }, []);

  const showFailure = useCallback((message: string) => {
    haptics.notification('error');
    setFailure(message);
    setStage('failure');
  }, [haptics]);

  const charge = useCallback(async (payload: FairQrPayload) => {
    setStage('processing');

    let lastError: unknown = null;
    for (let attempt = 0; attempt < RPC_RETRIES; attempt++) {
      let data: unknown = null;
      let error: unknown = null;
      try {
        const res = await withTimeout(
          supabase.rpc('pay_fair_purchase', {
            p_tx_id: payload.tx_id,
            p_amount: payload.amount,
            p_supervisor_id: payload.supervisor_id,
            p_supervisor_team: payload.supervisor_team,
            p_code_id: payload.is_reusable ? payload.code_id ?? null : null,
            p_label: payload.label ?? null,
          }),
          RPC_TIMEOUT_MS,
        );
        data = res.data;
        error = res.error;
      } catch (e) {
        error = e;
      }

      if (!error) {
        const res = (data ?? {}) as { status?: string; balance?: number; balance_after?: number; label?: string | null; tx_id?: string };
        if (res.status === 'insufficient_funds') {
          showFailure(`Недостатньо Айрон-доларів (Баланс: ${res.balance ?? balance} А$, Сума: ${payload.amount} А$)`);
          return;
        }
        if (res.status === 'ok' || res.status === 'duplicate') {
          if (typeof res.balance_after === 'number') onPaid?.(res.balance_after);
          
          // Миттєвий WebSocket-пінг касиру супроводу
          {
            const targets = [
              payload.supervisor_id ? `supervisor_fair_${payload.supervisor_id}` : null,
              payload.code ? `fair_code_${payload.code}` : null,
            ].filter(Boolean) as string[];
            const body = {
              childName: childName || 'Дитина',
              teamNumber: childTeam ?? 0,
              amount: Math.abs(payload.amount),
              txId: payload.tx_id,
            };
            targets.forEach((name) => {
              void (async () => {
                const ch = supabase.channel(name);
                try {
                  await ch.subscribe();
                  await ch.send({ type: 'broadcast', event: 'FAIR_PAYMENT_SUCCESS', payload: body });
                } catch { /* ledger fallback */ }
                supabase.removeChannel(ch);
              })();
            });
          }

          stopCamera();
          setReceipt({
            merchant: payload.supervisor_name || 'Ярмарок · Залізна зміна',
            amount: payload.amount,
            txId: res.tx_id || payload.tx_id,
            at: new Date(),
            label: res.label ?? payload.label ?? null,
          });
          
          if (!mountedRef.current) return;
          setStage('success');
          haptics.notification('success');
          setTimeout(() => triggerConfetti(confettiRef.current), 200);
          return;
        }
        showFailure('Не вдалося провести оплату');
        return;
      }

      lastError = error;
      const msg = String((error as any)?.message || '');
      const restricted = msg.match(/RESTRICTED_TEAM_PAYMENT:?(\d+)?/);
      if (restricted) {
        showFailure(`Оплата доступна лише для учасників Команди №${restricted[1] ?? payload.supervisor_team ?? ''}!`);
        return;
      }
      if (/fair_closed/.test(msg)) {
        showFailure('Ярмарок наразі закрито. Покупки доступні лише під час слоту ярмарку за розкладом.');
        return;
      }
      if (/double_scan_guard/.test(msg)) { showFailure('Захист від подвійного сканування'); return; }
      if (/unknown_preset/.test(msg)) { showFailure('Цінник більше не діє'); return; }
      if (/tx_already_used/.test(msg)) { showFailure('Цей QR-код вже використано'); return; }
      if (/invalid_amount/.test(msg)) { showFailure('Недійсна сума в QR-коді'); return; }
      if (/not_a_child|not_authenticated/.test(msg)) { showFailure('Сесію втрачено, увійдіть знову'); return; }
      
      island.showError('Повторна спроба зʼєднання…', 'Списання не подвоїться');
      await sleep(700 * (attempt + 1));
    }

    showFailure(lastError ? 'Немає звʼязку. Спробуйте ще раз — списання не подвоїться' : 'Не вдалося провести оплату');
  }, [balance, childName, childTeam, haptics, island, onPaid, showFailure, stopCamera]);

  const handleDecoded = useCallback((raw: string) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setTimeout(() => { lockedRef.current = false; }, SCAN_LOCK_MS);

    cancelAnimationFrame(rafRef.current);
    try { videoRef.current?.pause(); } catch { /* ignore */ }
    haptics.impact('medium');

    const parsed = parseFairQr(raw);
    if (!parsed.ok) {
      showFailure(parsed.reason === 'expired'
        ? 'QR-код застарів, попросіть новий у супроводу'
        : 'Недійсний QR-код ярмарку');
      return;
    }
    charge(parsed.payload);
  }, [charge, haptics, showFailure]);

  // Життєвий цикл камери
  useEffect(() => {
    if (!open || stage !== 'scanning') return;
    let cancelled = false;
    mountedRef.current = true;

    let lastDecode = 0;
    const scan = (now: number) => {
      const video = videoRef.current;
      const canvas = frameRef.current;
      const due = now - lastDecode >= SCAN_INTERVAL_MS;
      if (!cancelled && due && video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        lastDecode = now;
        const w = 320;
        const h = Math.max(1, Math.round((video.videoHeight / (video.videoWidth || 1)) * w)) || 320;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          try {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.location) {
              const rw = video.clientWidth || w;
              const rh = video.clientHeight || h;
              const s = Math.max(rw / w, rh / h);
              const offX = (rw - w * s) / 2;
              const offY = (rh - h * s) / 2;
              const pts = [
                code.location.topLeftCorner,
                code.location.topRightCorner,
                code.location.bottomRightCorner,
                code.location.bottomLeftCorner,
              ].map((p) => ({ x: offX + p.x * s, y: offY + p.y * s }));
              const xs = pts.map((p) => p.x);
              const ys = pts.map((p) => p.y);
              const minX = Math.min(...xs);
              const minY = Math.min(...ys);
              applyBox({ x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }, now);
            } else {
              applyBox(null, now);
            }
            if (code?.data) handleDecoded(code.data);
          } catch { /* frame skip */ }
        }
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(scan);
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera');
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // @ts-expect-error non-standard WebRTC constraint
            advanced: [{ focusMode: 'continuous' }],
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices
          .getUserMedia(constraints)
          .catch(() => navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          }))
          .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
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
  }, [open, stage, handleDecoded, stopCamera, applyBox]);

  useEffect(() => {
    if (open) {
      mountedRef.current = true;
      setStage('scanning');
      setFailure(null);
      setReceipt(null);
      setManualCode('');
      lastBoxUpdateRef.current = 0;
      if (boxRef.current) boxRef.current.style.opacity = '0';
      lockedRef.current = false;
    } else {
      mountedRef.current = false;
      stopCamera();
    }
  }, [open, stopCamera]);

  useEffect(() => () => { mountedRef.current = false; stopCamera(); }, [stopCamera]);

  useEffect(() => {
    if (stage !== 'failure') return;
    const t = setTimeout(() => {
      setFailure(null);
      setStage(cameraReady ? 'scanning' : 'manual');
    }, 3200);
    return () => clearTimeout(t);
  }, [stage, cameraReady]);

  const submitManual = useCallback(async (raw?: string) => {
    const code = normalizeFairCode(raw ?? manualCode);
    if (code.length !== FAIR_CODE_LENGTH) { showFailure('Недійсний код ярмарку'); return; }
    haptics.impact('medium');
    setStage('processing');

    const { data: raw2, error } = await supabase.rpc('resolve_fair_code', { p_code: code });

    if (error) { showFailure('Немає звʼязку. Спробуйте ще раз'); return; }
    const data = raw2 as unknown as {
      tx_id: string;
      amount: number;
      supervisor_user_id: string | null;
      supervisor_team: number | null;
      expires_at: string;
    } | null;
    if (!data) { showFailure('Код не знайдено або він застарів'); return; }
    if (new Date(data.expires_at).getTime() < Date.now()) {
      showFailure('Код застарів, попросіть новий у супроводу');
      return;
    }

    charge({
      type: 'CAMP_FAIR_PAYMENT',
      tx_id: data.tx_id,
      supervisor_id: data.supervisor_user_id,
      supervisor_team: data.supervisor_team,
      supervisor_name: data.supervisor_team
        ? `Ярмарок · Команда ${data.supervisor_team}`
        : 'Ярмарок · Залізна зміна',
      amount: data.amount,
      timestamp: Date.now(),
      code,
    });
  }, [manualCode, charge, haptics, showFailure]);

  if (!open) return null;

  const close = () => { stopCamera(); onClose(); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      
      {/* Вбудовані плавні стилі для сканера та анімації чека */}
      <style>{`
        @keyframes laserSweep {
          0% { top: 6%; opacity: 0.2; }
          50% { opacity: 1; }
          100% { top: 92%; opacity: 0.2; }
        }
        @keyframes checkmarkDraw {
          0% { stroke-dashoffset: 50; }
          100% { stroke-dashoffset: 0; }
        }
        .anim-laser {
          animation: laserSweep 2s ease-in-out infinite alternate;
        }
        .anim-check {
          stroke-dasharray: 50;
          stroke-dashoffset: 50;
          animation: checkmarkDraw 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.2s;
        }
      `}</style>

      {/* Головна картка модального вікна */}
      <div className="relative w-full max-w-sm rounded-[32px] border border-white/15 bg-[#0C0F17]/95 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl overflow-hidden text-slate-100 flex flex-col justify-between">
        <canvas ref={confettiRef} className="pointer-events-none absolute inset-0 w-full h-full z-30" />

        {/* Верхній рядок: Баланс та кнопка закриття */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 relative z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#FA5A15]/20 border border-[#FA5A15]/30 flex items-center justify-center text-[#FA5A15]">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Оплата на ярмарку</p>
              <p className="text-xs font-mono font-bold text-white tabular-nums">
                Баланс: <span className="text-[#FA5A15]">{balance}</span> А$
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="Закрити"
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 active:scale-90 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* 1. СТАН СКАНУВАННЯ КАМЕРОЮ */}
        {(stage === 'scanning' || stage === 'processing') && (
          <div className="mt-4 flex flex-col items-center relative z-10">
            {/* Вікно камери з лазером */}
            <div
              ref={viewportRef}
              className="relative w-60 h-60 rounded-3xl overflow-hidden bg-black border-2 border-white/20 shadow-2xl flex items-center justify-center"
            >
              <video
                ref={videoRef}
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              <canvas ref={frameRef} className="hidden" />
              
              {/* Рамка розпізнаного QR */}
              <span 
                ref={boxRef} 
                className="absolute border-2 border-[#FA5A15] rounded-xl transition-all duration-75 pointer-events-none opacity-0 shadow-[0_0_12px_#FA5A15]" 
              />

              {/* Лазер сканування */}
              {stage === 'scanning' && (
                <div className="anim-laser absolute inset-x-3 h-0.5 bg-gradient-to-r from-transparent via-[#FA5A15] to-transparent shadow-[0_0_12px_#FA5A15]" />
              )}

              {/* Спінер підтвердження */}
              {stage === 'processing' && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-[#FA5A15] border-t-transparent animate-spin" />
                  <span className="text-xs font-bold text-white tracking-wide">Проведення оплати...</span>
                </div>
              )}
            </div>

            {stage === 'scanning' && (
              <div className="mt-4 text-center w-full">
                <p className="text-sm font-bold text-white tracking-tight">Наведіть камеру на QR-код касира</p>
                <button
                  type="button"
                  onClick={() => { stopCamera(); setStage('manual'); }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-all active:scale-95"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#FA5A15]" /> 
                  <span>Ввести 5-значний код вручну</span>
                </button>
                <FairHowTo variant="child" className="mt-4 text-left" />
              </div>
            )}
          </div>
        )}

        {/* 2. СТАН РУЧНОГО ВВЕДЕННЯ КОДУ */}
        {stage === 'manual' && (
          <div className="mt-4 relative z-10 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FA5A15]/15 border border-[#FA5A15]/25 flex items-center justify-center text-[#FA5A15] mb-2 shadow-inner">
              <ScanLine className="w-8 h-8" strokeWidth={1.8} />
            </div>
            
            <h3 className="text-base font-bold text-white">Введіть код каси</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Введіть 5 цифр, вказаних під QR-кодом супроводу
            </p>

            <Input
              value={manualCode}
              onChange={(e) => {
                const next = normalizeFairCode(e.target.value);
                setManualCode(next);
                if (next.length === FAIR_CODE_LENGTH) void submitManual(next);
              }}
              placeholder="00000"
              inputMode="numeric"
              type="tel"
              autoComplete="one-time-code"
              maxLength={FAIR_CODE_LENGTH}
              className="mt-4 h-14 text-center font-mono text-3xl font-black tracking-[0.35em] bg-white/5 border-white/15 text-white placeholder:text-slate-600 rounded-2xl focus:border-[#FA5A15]"
            />

            <Button
              onClick={() => void submitManual()}
              disabled={manualCode.length !== FAIR_CODE_LENGTH}
              className="w-full h-12 mt-3 rounded-2xl bg-[#FA5A15] hover:bg-[#FF7D3B] text-white font-bold active:scale-[0.98] transition-all shadow-md"
            >
              Підтвердити оплату
            </Button>

            {cameraReady && (
              <button
                type="button"
                onClick={() => setStage('scanning')}
                className="mt-3 text-xs text-slate-400 hover:text-white transition-colors"
              >
                ← Повернутися до камери
              </button>
            )}
          </div>
        )}

        {/* 3. СТАН УСПІХУ ТА ЧЕК (APPLE PAY RECEIPT) */}
        {stage === 'success' && receipt && (
          <div className="mt-4 flex flex-col items-center relative z-10 text-center animate-fade-in">
            {/* Анімована зелена галочка */}
            <div className="relative w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.35)] mb-2">
              <svg viewBox="0 0 52 52" className="w-8 h-8 text-emerald-400 stroke-current" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path className="anim-check" d="M14 27 L23 36 L38 18" />
              </svg>
            </div>

            <h3 className="text-xl font-black text-white tracking-tight">Оплачено успішно</h3>
            <p className="text-xs font-mono font-bold text-[#FA5A15] mt-0.5">
              -{receipt.amount} А$
            </p>

            {/* Деталі чека */}
            <div className="w-full mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-xs space-y-2 text-left">
              {receipt.label && (
                <div className="flex justify-between items-center text-slate-400">
                  <span className="flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5 text-primary" /> Товар:</span>
                  <span className="text-white font-semibold truncate max-w-[160px]">{receipt.label}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-sky-400" /> Точка / Каса:</span>
                <span className="text-white font-semibold truncate max-w-[160px]">{receipt.merchant}</span>
              </div>

              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-amber-400" /> Транзакція:</span>
                <span className="text-white font-mono font-bold">{receipt.txId.slice(0, 8).toUpperCase()}</span>
              </div>

              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> Час оплати:</span>
                <span className="text-white font-mono font-semibold">
                  {receipt.at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            <Button 
              onClick={close} 
              className="w-full h-12 mt-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold active:scale-[0.98] transition-all shadow-md"
            >
              Готово
            </Button>
          </div>
        )}

        {/* 4. СТАН ПОМИЛКИ */}
        {stage === 'failure' && (
          <div className="mt-4 flex flex-col items-center py-2 relative z-10 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_24px_rgba(244,63,94,0.35)] mb-2">
              <AlertCircle className="w-8 h-8" strokeWidth={2} />
            </div>

            <h3 className="text-lg font-bold text-white">Помилка оплати</h3>
            <p className="mt-1 text-xs text-rose-300 font-medium px-2 leading-relaxed">
              {failure}
            </p>

            <Button
              variant="outline"
              onClick={() => { setFailure(null); setStage(cameraReady ? 'scanning' : 'manual'); }}
              className="w-full h-11 mt-4 rounded-2xl border-white/10 hover:bg-white/10 font-bold active:scale-[0.98] transition-all"
            >
              Спробувати знову
            </Button>
          </div>
        )}

      </div>
    </div>
  );
};

export default ApplePayScannerModal;
