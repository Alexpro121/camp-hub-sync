import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface IronLoaderProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
}

/**
 * Carpathian Mountain Brand Loader — автентична кінематографічна анімація гірських хребтів "Залізна Зміна".
 * Використовується для оверлеїв, завантаження даних та пустих станів.
 */
export const IronLoader: React.FC<IronLoaderProps> = ({ 
  size = 'md', 
  label,
  className 
}) => {
  const id = useId();

  // Розміри контейнера
  const sizeMap = {
    xs: { wrap: 'w-10 h-7', svg: 'w-10 h-7' },
    sm: { wrap: 'w-14 h-10', svg: 'w-14 h-10' },
    md: { wrap: 'w-24 h-16', svg: 'w-24 h-16' },
    lg: { wrap: 'w-32 h-22', svg: 'w-32 h-22' },
    xl: { wrap: 'w-44 h-30', svg: 'w-44 h-30' },
  }[size];

  const fillGradId = `mountain-fill-${id}`;
  const beamGradId = `ridge-beam-${id}`;
  const glowGradId = `aurora-glow-${id}`;

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3.5 select-none', className)}>
      <div className={cn('relative flex items-center justify-center transform-gpu will-change-transform', sizeMap.wrap)}>
        
        {/* Фоновий розсіяний неоновий ореол за вершинами */}
        <div 
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-4/5 h-4/5 rounded-full blur-2xl opacity-60 pointer-events-none animate-[pulseAura_3s_ease-in-out_infinite]"
          style={{
            background: 'radial-gradient(circle, rgba(250,90,21,0.45) 0%, rgba(255,125,59,0.15) 50%, transparent 80%)'
          }}
        />

        {/* Головна векторна композиція Карпатських гір */}
        <svg
          viewBox="0 0 100 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn('relative drop-shadow-[0_8px_24px_rgba(250,90,21,0.35)] overflow-visible', sizeMap.svg)}
          shapeRendering="geometricPrecision"
        >
          <defs>
            {/* Тіло Карпатських гір (Obsidian Gradient) */}
            <linearGradient id={fillGradId} x1="50" y1="12" x2="50" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FA5A15" stopOpacity="0.45" />
              <stop offset="45%" stopColor="#FA5A15" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#07090E" stopOpacity="0.0" />
            </linearGradient>

            {/* Біжучий лазерний промінь */}
            <linearGradient id={beamGradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FA5A15" stopOpacity="0.0" />
              <stop offset="40%" stopColor="#FA5A15" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="100%" stopColor="#FF7D3B" stopOpacity="0.0" />
            </linearGradient>

            {/* Сяйво спалаху вершини */}
            <radialGradient id={glowGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="40%" stopColor="#FA5A15" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FA5A15" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 1. Далекий гірський хребет (Фоновий шар) */}
          <path
            d="M 12 54 L 30 32 L 44 42 L 64 22 L 88 54"
            stroke="#FA5A15"
            strokeWidth="1.2"
            strokeOpacity="0.22"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* 2. Основне тіло головних піків із градієнтним заповненням */}
          <path
            d="M 6 56 L 24 32 L 36 42 L 52 12 L 66 34 L 78 24 L 94 56 Z"
            fill={`url(#${fillGradId})`}
          />

          {/* 3. Статичний матовий контур хребта */}
          <path
            d="M 6 56 L 24 32 L 36 42 L 52 12 L 66 34 L 78 24 L 94 56"
            stroke="#FA5A15"
            strokeWidth="1.8"
            strokeOpacity="0.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* 4. Внутрішні тіньові грані піків (Faceted 3D Peak Lines) */}
          <path
            d="M 52 12 L 52 56 M 24 32 L 28 56 M 78 24 L 74 56"
            stroke="#FA5A15"
            strokeWidth="1"
            strokeOpacity="0.18"
            strokeLinecap="round"
          />

          {/* 5. Біжучий неоновий світловий промінь по контуру (Light Beam) */}
          <path
            d="M 6 56 L 24 32 L 36 42 L 52 12 L 66 34 L 78 24 L 94 56"
            stroke={`url(#${beamGradId})`}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            className="animate-[ridgeImpulse_2.4s_cubic-bezier(0.4,0,0.2,1)_infinite]"
            style={{
              strokeDasharray: '45, 140',
            }}
          />

          {/* 6. Іскра / Зірка над головною вершиною (Спалахує в унісон із променем) */}
          <g className="animate-[apexPulse_2.4s_ease-in-out_infinite]">
            <circle cx="52" cy="12" r="6" fill={`url(#${glowGradId})`} opacity="0.6" className="blur-[2px]" />
            <circle cx="52" cy="12" r="2.2" fill="#FFFFFF" />
            <circle cx="52" cy="12" r="1.2" fill="#FA5A15" />
          </g>

          {/* 7. Альпійський туман біля підніжжя (Плавне хвильове дихання) */}
          <path
            d="M 10 56 C 26 53, 40 58, 56 54 C 70 51, 82 56, 90 56"
            stroke="#FA5A15"
            strokeWidth="1.4"
            strokeOpacity="0.4"
            strokeLinecap="round"
            className="animate-[mistDrift_3.2s_ease-in-out_infinite_alternate]"
          />
        </svg>

      </div>

      {/* Підпис під лоадером */}
      {label && (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FA5A15] animate-[bounceDot_1.4s_infinite_0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#FA5A15] animate-[bounceDot_1.4s_infinite_200ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#FA5A15] animate-[bounceDot_1.4s_infinite_400ms]" />
          </span>
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] text-slate-300 font-bold font-mono">
            {label}
          </p>
        </div>
      )}

      {/* Апаратні CSS-анімації */}
      <style>{`
        @keyframes ridgeImpulse {
          0% { stroke-dashoffset: 185; opacity: 0.1; }
          40% { opacity: 1; }
          100% { stroke-dashoffset: -45; opacity: 0.1; }
        }
        @keyframes apexPulse {
          0%, 100% { transform: scale(0.85); opacity: 0.5; }
          42% { transform: scale(1.35); opacity: 1; }
          58% { transform: scale(1); opacity: 0.7; }
        }
        @keyframes pulseAura {
          0%, 100% { transform: translate(-50%, 0) scale(0.9); opacity: 0.45; }
          50% { transform: translate(-50%, -2px) scale(1.15); opacity: 0.85; }
        }
        @keyframes mistDrift {
          0% { transform: translateX(-4px); opacity: 0.25; }
          100% { transform: translateX(4px); opacity: 0.65; }
        }
        @keyframes bounceDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

/**
 * Повноекранний оверлей-лоадер з глибоким розмиттям Obsidian Glass.
 * Використовується при авторизації, перемиканні змін та критичних діях.
 */
export const FullScreenLoader: React.FC<{ label?: string }> = ({ 
  label = 'Завантаження' 
}) => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#07090E]/92 backdrop-blur-2xl select-none animate-fade-in">
    {/* Атмосферний фоновий перелив */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full bg-[#FA5A15]/10 blur-[100px] pointer-events-none" />
    <IronLoader size="lg" label={label} />
  </div>
);

/**
 * Вбудований лоадер для секцій розкладу, таблиць та списків без блокування всього екрана.
 */
export const InlineLoader: React.FC<{ 
  label?: string; 
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}> = ({ 
  label, 
  className,
  size = 'md'
}) => (
  <div className={cn('flex items-center justify-center py-10 select-none animate-fade-in', className)}>
    <IronLoader size={size} label={label} />
  </div>
);

/**
 * Мерехтливий скелетон-бар (Liquid Glass Shimmer) для плавного відображення карток.
 */
export const ShimmerBar: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('relative overflow-hidden rounded-2xl bg-white/[0.04] border border-white/5', className)}>
    <div className="absolute inset-0 -translate-x-full animate-[liquidShimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-[#FA5A15]/15 to-transparent" />
    <style>{`
      @keyframes liquidShimmer {
        100% { transform: translateX(200%); }
      }
    `}</style>
  </div>
);

export default IronLoader;
