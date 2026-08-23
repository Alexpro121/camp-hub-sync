import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Carpathian Mountain Brand Loader — автентична анімація гірських хребтів "Залізна Зміна".
 * Використовується для оверлеїв, завантаження даних та пустих станів.
 */
export const IronLoader = ({ 
  size = 'md', 
  label,
  className 
}: { 
  size?: 'sm' | 'md' | 'lg'; 
  label?: string;
  className?: string;
}) => {
  // Розміри контейнера
  const sizeClasses = {
    sm: 'w-12 h-9',
    md: 'w-20 h-14',
    lg: 'w-28 h-20',
  }[size];

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 select-none', className)}>
      <div className={cn('relative flex items-center justify-center', sizeClasses)}>
        
        {/* Фоновий розсіяний ореол за горами */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3/4 h-3/4 rounded-full bg-primary/25 blur-xl animate-pulse" />

        {/* Головна SVG-анімація Карпатських гір */}
        <svg
          viewBox="0 0 100 65"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-[0_4px_16px_rgba(224,83,20,0.35)] overflow-visible"
        >
          <defs>
            {/* Градієнт заливки гірських схилів */}
            <linearGradient id="mountainFillGrad" x1="50" y1="10" x2="50" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
              <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
            </linearGradient>

            {/* Градієнт для світлового променя хребта */}
            <linearGradient id="ridgeBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Сонце / Зірка над головною вершиною (пульсує) */}
          <g className="animate-[summitGlow_3s_ease-in-out_infinite]">
            <circle cx="50" cy="14" r="5" fill="hsl(var(--primary))" opacity="0.35" className="blur-[2px]" />
            <circle cx="50" cy="14" r="2.5" fill="#FFFFFF" />
            <circle cx="50" cy="14" r="1.2" fill="hsl(var(--primary))" />
          </g>

          {/* Далекий силует хребта */}
          <path
            d="M10 54 L32 30 L45 42 L65 22 L90 54"
            stroke="hsl(var(--primary))"
            strokeWidth="1.2"
            strokeOpacity="0.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Основне тіло Карпатських гір із м'яким градієнтом */}
          <path
            d="M6 56 L24 34 L36 44 L50 14 L64 36 L76 26 L94 56 Z"
            fill="url(#mountainFillGrad)"
          />

          {/* Базовий статичний контур хребта */}
          <path
            d="M6 56 L24 34 L36 44 L50 14 L64 36 L76 26 L94 56"
            stroke="hsl(var(--primary))"
            strokeWidth="1.8"
            strokeOpacity="0.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Біжучий світловий імпульс по кромці гір (Light Beam) */}
          <path
            d="M6 56 L24 34 L36 44 L50 14 L64 36 L76 26 L94 56"
            stroke="url(#ridgeBeamGrad)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            className="animate-[ridgePulse_2.4s_cubic-bezier(0.4,0,0.2,1)_infinite]"
            style={{
              strokeDasharray: '35, 120',
            }}
          />

          {/* Альпійський туман біля підніжжя (хвилеподібний дрейф) */}
          <path
            d="M12 56 C28 53, 42 58, 58 55 C72 52, 82 56, 88 56"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            strokeLinecap="round"
            className="animate-[mistShift_3.5s_ease-in-out_infinite_alternate]"
          />
        </svg>

      </div>

      {/* Підпис під лоадером */}
      {label && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.25em] text-muted-foreground font-bold font-mono">
            {label}
          </p>
        </div>
      )}

      {/* Вбудовані keyframes для плавної та швидкої роботи без сторонніх конфігів */}
      <style>{`
        @keyframes ridgePulse {
          0% { stroke-dashoffset: 155; opacity: 0.2; }
          40% { opacity: 1; }
          100% { stroke-dashoffset: -35; opacity: 0.2; }
        }
        @keyframes summitGlow {
          0%, 100% { transform: translateY(0) scale(0.9); opacity: 0.7; }
          50% { transform: translateY(-1.5px) scale(1.25); opacity: 1; }
        }
        @keyframes mistShift {
          0% { transform: translateX(-3px); opacity: 0.3; }
          100% { transform: translateX(3px); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

/**
 * Повноекранний лоадер з розмиттям фону та Карпатським лоадером.
 * Використовується при вході, авторизації та глобальних завантаженнях.
 */
export const FullScreenLoader = ({ label = 'Завантаження' }: { label?: string }) => (
  <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/85 backdrop-blur-md animate-fade-in select-none">
    <IronLoader size="lg" label={label} />
  </div>
);

/**
 * Лоадер для окремих секцій (таблиць, списків, розкладу) без блокування всього екрана.
 */
export const InlineLoader = ({ 
  label, 
  className 
}: { 
  label?: string; 
  className?: string;
}) => (
  <div className={cn('flex items-center justify-center py-12 animate-fade-in select-none', className)}>
    <IronLoader size="md" label={label} />
  </div>
);

/**
 * Мерехтливий скелетон-бар (Shimmer) для плавного завантаження списків та карток.
 */
export const ShimmerBar = ({ className }: { className?: string }) => (
  <div className={cn('relative overflow-hidden rounded-xl bg-muted/40 border border-border/30', className)}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmerSlide_1.8s_infinite] bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    <style>{`
      @keyframes shimmerSlide {
        100% { transform: translateX(200%); }
      }
    `}</style>
  </div>
);
