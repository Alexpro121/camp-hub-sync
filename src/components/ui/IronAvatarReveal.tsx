import { useEffect, useMemo, useRef, useState } from 'react';
import { generateIronAvatar, getPixelHex, type AvatarData } from '@/lib/ironAvatar';
import { useHaptics } from '@/hooks/useHaptics';

interface Props {
  name: string;
  onComplete: () => void;
}

const PHASE_1_SCAN = 800;    // Лазерне попіксельне сканування
const PHASE_2_PULSE = 1100;  // Квантовий неоновий імпульс
const TOTAL_DURATION = 1450; // Плавний політ на місце біля ПІБ

/**
 * Кінематографічна повноекранна генерація піксельного аватара учасника
 * проєкту «Залізна Зміна». Чистий Canvas 2D + GPU-трансформації, без тексту.
 */
const IronAvatarReveal = ({ name, onComplete }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const hapticFiredRef = useRef(false);

  const haptics = useHaptics();
  const data = useMemo<AvatarData>(() => generateIronAvatar(name), [name]);
  const [boxSize, setBoxSize] = useState(0);

  const gridSize = data.size || 20;

  // Розрахунок розміру центрального початкового аватара під екран
  useEffect(() => {
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const side = Math.min(minDim * 0.55, 220);
    setBoxSize(Math.max(160, Math.floor(side / gridSize) * gridSize));
  }, [gridSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const root = rootRef.current;
    if (!canvas || !stage || !root || !boxSize) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const px = boxSize / gridSize;
    const start = performance.now();
    let raf = 0;

    // 🎯 ДИНАМІЧНЕ ОБЧИСЛЕННЯ ТОЧКИ ПОСАДКИ (БІЛЯ ПІБ)
    let targetX = 0;
    let targetY = 0;
    let targetScale = 56 / boxSize;

    const anchorEl = document.getElementById('child-avatar-anchor') || document.querySelector('[data-avatar-anchor]');
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      targetX = rect.left + rect.width / 2 - window.innerWidth / 2;
      targetY = rect.top + rect.height / 2 - window.innerHeight / 2;
      targetScale = rect.width / boxSize;
    } else {
      // Розумний фолбек для контейнера max-w-md
      const containerWidth = Math.min(window.innerWidth - 32, 448);
      const leftEdge = (window.innerWidth - containerWidth) / 2;
      targetX = leftEdge + 28 - window.innerWidth / 2;
      targetY = 76 - window.innerHeight / 2;
      targetScale = 56 / boxSize;
    }

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      haptics.notification('success');
      onComplete();
    };

    // Запобіжник від зависання
    const safetyTimeout = setTimeout(finish, TOTAL_DURATION + 250);

    // Малювання сканування матриці
    const drawScanPhase = (progress: number) => {
      ctx.clearRect(0, 0, boxSize, boxSize);
      ctx.imageSmoothingEnabled = false;

      const activeRow = progress * gridSize;

      for (let r = 0; r < gridSize; r++) {
        if (r > activeRow + 1.2) continue;

        for (let c = 0; c < gridSize; c++) {
          const val = data.matrix[r]?.[c] ?? 0;
          if (val === 0) continue;

          if (r < activeRow) {
            // Піксель уже проскановано
            ctx.fillStyle = getPixelHex(val, data.palette) || data.palette.mainColor;
            ctx.fillRect(c * px, r * px, px, px);
          } else {
            // Квантовий спалах на вістрі лазера
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(c * px, r * px, px, px);
          }
        }
      }

      // Лазерний промінь
      if (progress < 1) {
        const ly = Math.min(boxSize - 2, activeRow * px);
        const grad = ctx.createLinearGradient(0, ly - px * 1.5, 0, ly + px * 1.5);
        grad.addColorStop(0, 'rgba(250,90,21,0)');
        grad.addColorStop(0.5, '#FFFFFF');
        grad.addColorStop(1, 'rgba(250,90,21,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, ly - px * 1.5, boxSize, px * 3);
      }
    };

    // Малювання готового аватара
    const drawCompleteAvatar = () => {
      ctx.clearRect(0, 0, boxSize, boxSize);
      ctx.imageSmoothingEnabled = false;

      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const val = data.matrix[r]?.[c] ?? 0;
          if (val === 0) continue;
          ctx.fillStyle = getPixelHex(val, data.palette) || data.palette.mainColor;
          ctx.fillRect(c * px, r * px, px, px);
        }
      }
    };

    const tick = (now: number) => {
      const elapsed = now - start;

      if (elapsed < PHASE_1_SCAN) {
        // Фаза 1: Лазерне сканування
        const p = elapsed / PHASE_1_SCAN;
        drawScanPhase(p);
        stage.style.transform = 'translate3d(0, 0, 0) scale(1)';
        stage.style.filter = `drop-shadow(0 0 ${16 + p * 24}px ${data.palette.bloom || '#FA5A15'})`;
      } else if (elapsed < PHASE_2_PULSE) {
        // Фаза 2: Квантовий імпульс
        if (!hapticFiredRef.current) {
          haptics.impact('medium');
          hapticFiredRef.current = true;
        }

        const p = (elapsed - PHASE_1_SCAN) / (PHASE_2_PULSE - PHASE_1_SCAN);
        drawCompleteAvatar();

        const pulseScale = 1 + 0.09 * Math.sin(p * Math.PI);
        stage.style.transform = `translate3d(0, 0, 0) scale(${pulseScale})`;
        stage.style.filter = `drop-shadow(0 0 ${40 - p * 15}px ${data.palette.bloom || '#FA5A15'})`;
      } else if (elapsed < TOTAL_DURATION) {
        // Фаза 3: Плавний політ (Fly-in) на місце біля ПІБ
        const p = (elapsed - PHASE_2_PULSE) / (TOTAL_DURATION - PHASE_2_PULSE);
        // Плавне уповільнення (Ease-Out Quart)
        const ease = 1 - Math.pow(1 - p, 4);

        drawCompleteAvatar();

        const curX = targetX * ease;
        const curY = targetY * ease;
        const curScale = 1 - (1 - targetScale) * ease;

        stage.style.transform = `translate3d(${curX}px, ${curY}px, 0) scale(${curScale})`;
        stage.style.filter = `drop-shadow(0 0 ${20 * (1 - ease)}px ${data.palette.bloom || '#FA5A15'})`;
        root.style.opacity = String(1 - ease);
      } else {
        root.style.opacity = '0';
        clearTimeout(safetyTimeout);
        finish();
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safetyTimeout);
    };
  }, [boxSize, data, onComplete, gridSize, haptics]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[1000] bg-[#07090E] flex items-center justify-center overflow-hidden pointer-events-none select-none"
      style={{ willChange: 'opacity', transition: 'opacity 140ms ease-out' }}
      aria-hidden="true"
    >
      {/* Фоновий неоновий ореол */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] rounded-full blur-[100px] pointer-events-none opacity-40"
        style={{ background: data.palette.bloom || '#FA5A15' }}
      />

      <div
        ref={stageRef}
        className="transform-gpu will-change-transform"
        style={{ transformOrigin: 'center center' }}
      >
        <canvas
          ref={canvasRef}
          width={boxSize}
          height={boxSize}
          className="rounded-2xl"
          style={{
            width: boxSize,
            height: boxSize,
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  );
};

export default IronAvatarReveal;
