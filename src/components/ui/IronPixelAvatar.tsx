import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AVATAR_GRID, generateIronAvatar, renderAvatarToCanvas } from '@/lib/ironAvatar';
import { cn } from '@/lib/utils';

interface Props {
  name: string;
  size?: number;
  className?: string;
  /** Чистий рендер піксель-арту без рамок і внутрішнього сяйва. */
  bare?: boolean;
}

/** Піксельний аватар учасника проєкту «Залізна Зміна» з анімацією появи та морганням. */
const IronPixelAvatar = ({ name, size = 56, className, bare = false }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useMemo(() => generateIronAvatar(name), [name]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderAvatarToCanvas(canvas, data);
    setVisible(true);

    // Періодичне моргання очей.
    let blinkTimeout: number;
    let unblinkTimeout: number;
    let cancelled = false;
    const scheduleBlink = () => {
      blinkTimeout = window.setTimeout(() => {
        if (cancelled) return;
        renderAvatarToCanvas(canvas, data, { blinking: true });
        unblinkTimeout = window.setTimeout(() => {
          if (cancelled) return;
          renderAvatarToCanvas(canvas, data);
          scheduleBlink();
        }, 180);
      }, data.blinkPeriodMs);
    };
    scheduleBlink();
    return () => {
      cancelled = true;
      window.clearTimeout(blinkTimeout);
      window.clearTimeout(unblinkTimeout);
    };
  }, [data]);

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        bare
          ? 'rounded-xl shadow-md shrink-0'
          : 'rounded-2xl border border-white/10 shadow-[inset_0_1px_8px_rgba(255,255,255,0.08),0_2px_12px_rgba(0,0,0,0.35)]',
        'transition-all duration-500 ease-out',
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75',
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Аватар учасника ${name}`}
    >
      <canvas
        ref={canvasRef}
        width={AVATAR_GRID * 4}
        height={AVATAR_GRID * 4}
        className="w-full h-full [image-rendering:pixelated]"
      />
      {!bare && (
        <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-transparent to-black/20" />
      )}
    </div>
  );

};

export default memo(IronPixelAvatar);
