import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AVATAR_GRID, generateIronAvatar, renderAvatarToCanvas, type AvatarData } from '@/lib/ironAvatar';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  name: string;
  size?: number;
  className?: string;
  /** Чистий рендер піксель-арту без рамок і внутрішнього сяйва (біля ПІБ) */
  bare?: boolean;
  /** Інтерактивний аватар із тактильним відгуком та реакцією на клік */
  onClick?: () => void;
}

/**
 * Піксельний кібер-аватар учасника проєкту «Залізна Зміна».
 * Детермінований рендер 20×20 з живим морганням та 60 FPS оптимізацією.
 */
const IronPixelAvatar: React.FC<Props> = ({ 
  name, 
  size = 56, 
  className, 
  bare = false,
  onClick 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useMemo<AvatarData>(() => generateIronAvatar(name), [name]);
  const [visible, setVisible] = useState(false);
  const haptics = useHaptics();

  // Безпечний детермінований розрахунок інтервалу моргання (3.2 – 6.0 сек)
  const blinkPeriod = useMemo(() => {
    const rawPeriod = (data as any)?.blinkPeriodMs;
    if (typeof rawPeriod === 'number' && rawPeriod > 1000) return rawPeriod;
    return 3200 + ((data?.seed ?? 0) % 2800);
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Первинний рендер
    renderAvatarToCanvas(canvas, data);
    setVisible(true);

    let blinkTimeout: ReturnType<typeof setTimeout>;
    let unblinkTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    // Цикл періодичного природного моргання
    const scheduleBlink = () => {
      blinkTimeout = setTimeout(() => {
        if (cancelled) return;

        // Заплющені очі
        renderAvatarToCanvas(canvas, data, { blinking: true } as any);

        unblinkTimeout = setTimeout(() => {
          if (cancelled) return;

          // Розплющені очі
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

  const handleClick = () => {
    if (!onClick) return;
    haptics.impact('light');
    onClick();
  };

  const gridDimension = data?.size || AVATAR_GRID || 20;
  // Масштабування для Retina-екранів
  const canvasResolution = Math.max(gridDimension * 4, size * 2);

  return (
    <div
      onClick={onClick ? handleClick : undefined}
      className={cn(
        'relative overflow-hidden select-none transition-all duration-300 transform-gpu',
        bare
          ? 'rounded-xl shadow-md shrink-0'
          : 'rounded-2xl border border-white/10 bg-[#0F1523]/80 shadow-[inset_0_1px_8px_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.45)]',
        onClick && 'cursor-pointer active:scale-95 hover:border-white/20',
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90',
        className,
      )}
      style={{ width: size, height: size }}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Аватар учасника ${name}`}
    >
      <canvas
        ref={canvasRef}
        width={canvasResolution}
        height={canvasResolution}
        className="w-full h-full [image-rendering:pixelated]"
        style={{ imageRendering: 'pixelated' }}
      />
      
      {/* Делікатний скляний відблиск для стандартного режиму */}
      {!bare && (
        <span 
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-transparent to-black/30" 
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default memo(IronPixelAvatar);
