import { Cog } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Brand loader — обертання шестерень у фірмовому стилі "Залізна Зміна".
 * Використовуй для overlay-ів і пустих станів.
 */
export const IronLoader = ({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) => {
  const px = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-20 h-20' : 'w-14 h-14';
  const inner = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={cn('relative', px)}>
        {/* Outer pulsing glow */}
        <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse" />
        {/* Rotating gear ring */}
        <div className={cn('absolute inset-0 flex items-center justify-center animate-spin-slow')}>
          <Cog className={cn('text-primary drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]', px)} strokeWidth={1.5} />
        </div>
        {/* Counter-rotating inner cog */}
        <div className="absolute inset-0 flex items-center justify-center animate-spin-reverse">
          <Cog className={cn('text-primary-glow opacity-80', inner)} strokeWidth={2} />
        </div>
      </div>
      {label && (
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground font-bold animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
};

/** Full-screen overlay loader. Show during page-level data fetches. */
export const FullScreenLoader = ({ label = 'Завантаження' }: { label?: string }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-sm animate-fade-in">
    <IronLoader size="lg" label={label} />
  </div>
);

/** Inline loader for content sections — keeps layout intact. */
export const InlineLoader = ({ label, className }: { label?: string; className?: string }) => (
  <div className={cn('flex items-center justify-center py-12 animate-fade-in', className)}>
    <IronLoader size="md" label={label} />
  </div>
);

/** Shimmering bar — для скелетонів/прогресу. */
export const ShimmerBar = ({ className }: { className?: string }) => (
  <div className={cn('relative overflow-hidden rounded-md bg-surface-2/60', className)}>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
  </div>
);
