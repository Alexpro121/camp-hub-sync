import React, { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AVATAR_GRID, generateIronAvatar, renderAvatarToCanvas, type AvatarData } from '@/lib/ironAvatar';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { Sparkles } from 'lucide-react';

interface Props {
  name: string;
  size?: number;
  className?: string;
  /** Чистий рендер піксель-арту без рамок і внутрішнього сяйва (біля ПІБ) */
  bare?: boolean;
  /** Звичайний клік */
  onClick?: () => void;
  /** Увімкнути плавний перегляд при затисканні (за замовчуванням увімкнено) */
  enableLongPress?: boolean;
}

const HOLD_DURATION_MS = 380; // Час утримання для активації Quick Look

/**
 * Піксельний кібер-аватар учасника проєкту «Залізна Зміна».
 * Підтримує живий моргаючий рендер та плавний повноекранний Quick Look при затисканні.
 */
const IronPixelAvatar: React.FC<Props> = ({ 
  name, 
  size = 56, 
  className, 
  bare = false,
  onClick,
  enableLongPress = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const largeCanvasRef = useRef<HTMLCanvasElement>(null);
  const data = useMemo<AvatarData>(() => generateIronAvatar(name), [name]);
  
  const [visible, setVisible] = useState(false);
  const [isQuickLookOpen, setIsQuickLookOpen] = useState(false);
  
  const haptics = useHaptics();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  // Інтервал природного моргання (3.2 – 6.0 сек)
  const blinkPeriod = useMemo(() => {
    const raw = (data as any)?.blinkPeriodMs;
    if (typeof raw === 'number' && raw > 1000) return raw;
    return 3200 + ((data?.seed ?? 0) % 2800);
  }, [data]);

  // Основний рендер мініатюри
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderAvatarToCanvas(canvas, data);
    setVisible(true);

    let blinkTimeout: ReturnType<typeof setTimeout>;
    let unblinkTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const scheduleBlink = () => {
      blinkTimeout = setTimeout(() => {
        if (cancelled) return;
        renderAvatarToCanvas(canvas, data, { blinking: true } as any);

        unblinkTimeout = setTimeout(() => {
          if (cancelled) return;
          renderAvatarToCanvas(canvas, data, { blinking: false } as any);
          scheduleBlink();
        }, 160);
      }, blinkPeriod);
    };

    scheduleBlink();

    return () => {
      cancelled = true;
      clearTimeout(blinkTimeout);
      clearTimeout(unblinkTimeout);
    };
  }, [data, blinkPeriod]);

  // Рендер збільшеного аватара для модалки Quick Look
  useEffect(() => {
    if (!isQuickLookOpen) return;
    const canvas = largeCanvasRef.current;
    if (!canvas) return;
    renderAvatarToCanvas(canvas, data);
  }, [isQuickLookOpen, data]);

  /* =========================================================================
     ЖЕСТИ ЗАТИСКАННЯ (LONG-PRESS QUICK LOOK)
  ========================================================================= */
  const clearHoldTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerQuickLook = useCallback(() => {
    clearHoldTimer();
    haptics.impact('medium');
    setIsQuickLookOpen(true);
  }, [clearHoldTimer, haptics]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableLongPress) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    
    clearHoldTimer();
    timerRef.current = setTimeout(triggerQuickLook, HOLD_DURATION_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);

    // Якщо палець рухається (скрол сторінки) — скасовуємо жест
    if (dx > 8 || dy > 8) {
      clearHoldTimer();
    }
  };

  const handleTouchEnd = () => {
    clearHoldTimer();
    touchStartPos.current = null;
  };

  // Підтримка миші для десктопів
  const handleMouseDown = () => {
    if (!enableLongPress) return;
    clearHoldTimer();
    timerRef.current = setTimeout(triggerQuickLook, HOLD_DURATION_MS);
  };

  const handleMouseUp = () => {
    clearHoldTimer();
  };

  const closeQuickLook = () => {
    haptics.impact('light');
    setIsQuickLookOpen(false);
  };

  const gridDimension = data?.size || AVATAR_GRID || 20;
  const canvasResolution = Math.max(gridDimension * 4, size * 2);

  return (
    <>
      <div
        onClick={onClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={cn(
          'relative overflow-hidden select-none transition-all duration-300 transform-gpu cursor-pointer',
          bare
            ? 'rounded-xl shadow-md shrink-0'
            : 'rounded-2xl border border-white/10 bg-[#0F1523]/80 shadow-[inset_0_1px_8px_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.45)]',
          'active:scale-95 hover:border-white/25',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90',
          className,
        )}
        style={{ width: size, height: size }}
        role="button"
        tabIndex={0}
        aria-label={`Аватар учасника ${name}. Затисніть для перегляду суперсили`}
      >
        <canvas
          ref={canvasRef}
          width={canvasResolution}
          height={canvasResolution}
          className="w-full h-full [image-rendering:pixelated]"
          style={{ imageRendering: 'pixelated' }}
        />
        
        {!bare && (
          <span 
            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-transparent to-black/30" 
            aria-hidden="true"
          />
        )}
      </div>

      {/* ================= ШВИДКИЙ ПЕРЕГЛЯД АВАТАРА (QUICK LOOK PORTAL) ================= */}
      {isQuickLookOpen && createPortal(
        <div
          onClick={closeQuickLook}
          className="fixed inset-0 z-[99999] bg-[#07090E]/85 backdrop-blur-2xl flex flex-col items-center justify-center p-4 select-none animate-fade-in"
          style={{ animationDuration: '180ms' }}
          role="dialog"
          aria-modal="true"
          aria-label="Картка кібер-героя учасника"
        >
          {/* Сяючий ореол палітри */}
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full blur-[90px] pointer-events-none opacity-50 animate-pulse"
            style={{ background: data.palette?.bloom || '#FA5A15' }}
          />

          {/* Центральна плаваюча картка */}
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col items-center gap-3.5 p-6 rounded-3xl bg-[#0F1523]/95 border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] max-w-xs w-full text-center transform-gpu animate-in zoom-in-75 duration-200"
          >
            {/* Великий рендер аватара */}
            <div className="relative w-36 h-36 rounded-2xl overflow-hidden border border-white/15 bg-black/40 shadow-inner p-2 flex items-center justify-center">
              <canvas
                ref={largeCanvasRef}
                width={160}
                height={160}
                className="w-full h-full [image-rendering:pixelated]"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            {/* Титул та ім'я */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FA5A15] flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3" />
                {data.archetype?.name || 'Кібер-Герой'}
              </span>
              <h3 className="text-base font-black text-white leading-tight">
                {data.archetype?.title || name}
              </h3>
            </div>

            {/* Суперсила */}
            <div className="w-full p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Суперсила:</span>
              <span className="text-[#FA5A15] font-bold">{data.archetype?.power}</span>
            </div>

            <p className="text-[10px] text-slate-400 mt-1">
              Торкніться будь-де, щоб закрити
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default memo(IronPixelAvatar);
