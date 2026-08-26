import { useEffect, useMemo, useRef, useState } from 'react';
import { AVATAR_GRID, IRON_PALETTES, generateIronAvatar, renderAvatarToCanvas } from '@/lib/ironAvatar';

interface Props {
  name: string;
  onComplete: () => void;
}

const PHASE_1 = 800;   // сканування матриці
const PHASE_2 = 1100;  // імпульс
const TOTAL = 1400;    // приліт у кут + розчинення

/**
 * Кінематографічна повноекранна генерація піксельного аватара учасника
 * проєкту «Залізна Зміна». Чистий Canvas 2D + GPU-трансформації, без тексту.
 */
const IronAvatarReveal = ({ name, onComplete }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const data = useMemo(() => generateIronAvatar(name), [name]);
  const [box, setBox] = useState(0);

  useEffect(() => {
    const side = Math.min(window.innerWidth, window.innerHeight) * 0.52;
    setBox(Math.max(160, Math.floor(side / AVATAR_GRID) * AVATAR_GRID));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const root = rootRef.current;
    if (!canvas || !stage || !root || !box) return;

    const palette = IRON_PALETTES[data.paletteIndex];
    const ctx = canvas.getContext('2d');
    const px = box / AVATAR_GRID;
    const start = performance.now();
    let raf = 0;

    // Цільова точка «прильоту» — верхній лівий кут екрана.
    const targetX = 24 + 28 - window.innerWidth / 2;
    const targetY = 24 + 28 - window.innerHeight / 2;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onComplete();
    };

    const drawScan = (p: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, box, box);
      ctx.imageSmoothingEnabled = false;
      const activeRow = p * AVATAR_GRID;
      for (let y = 0; y < AVATAR_GRID; y++) {
        if (y > activeRow + 0.9) continue;
        for (let x = 0; x < AVATAR_GRID; x++) {
          if (!data.mask[y * AVATAR_GRID + x]) continue;
          if (y < activeRow) {
            const accent = (data.seed + x * 31 + y * 17) % 7 === 0;
            ctx.fillStyle = accent ? palette.accent : palette.body;
          } else {
            ctx.fillStyle = '#FFF7ED'; // спалах збірки
          }
          ctx.fillRect(x * px, y * px, px, px);
        }
      }
      // Лазерна лінія сканування.
      if (p < 1) {
        const ly = Math.min(box - 2, activeRow * px);
        const grad = ctx.createLinearGradient(0, ly - px, 0, ly + px);
        grad.addColorStop(0, 'rgba(250,90,21,0)');
        grad.addColorStop(0.5, 'rgba(255,247,237,0.95)');
        grad.addColorStop(1, 'rgba(250,90,21,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, ly - px, box, px * 2);
      }
    };

    const tick = (now: number) => {
      const t = now - start;

      if (t < PHASE_1) {
        const p = t / PHASE_1;
        drawScan(p);
        stage.style.transform = 'translate3d(0,0,0) scale(1)';
        stage.style.filter = `drop-shadow(0 0 ${12 + p * 18}px ${palette.body}aa)`;
      } else if (t < PHASE_2) {
        const p = (t - PHASE_1) / (PHASE_2 - PHASE_1);
        renderAvatarToCanvas(canvas, data);
        const pulse = 1 + 0.08 * Math.sin(p * Math.PI);
        stage.style.transform = `translate3d(0,0,0) scale(${pulse})`;
        stage.style.filter = `drop-shadow(0 0 ${36 - p * 12}px ${palette.body})`;
      } else if (t < TOTAL) {
        const p = (t - PHASE_2) / (TOTAL - PHASE_2);
        const e = 1 - Math.pow(1 - p, 3);
        renderAvatarToCanvas(canvas, data);
        const scale = 1 - 0.82 * e;
        stage.style.transform = `translate3d(${targetX * e}px, ${targetY * e}px, 0) scale(${scale})`;
        stage.style.filter = `drop-shadow(0 0 ${18 * (1 - e)}px ${palette.body})`;
        root.style.opacity = String(1 - e);
      } else {
        root.style.opacity = '0';
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [box, data, onComplete]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[1000] bg-[#07090E] flex items-center justify-center overflow-hidden"
      style={{ willChange: 'opacity', transition: 'opacity 120ms linear' }}
      aria-hidden="true"
    >
      <div
        ref={stageRef}
        style={{ willChange: 'transform, opacity', transform: 'translate3d(0,0,0)' }}
      >
        <canvas ref={canvasRef} width={box} height={box} style={{ width: box, height: box, imageRendering: 'pixelated' }} />
      </div>
    </div>
  );
};

export default IronAvatarReveal;
