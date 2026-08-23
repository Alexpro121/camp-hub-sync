import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKeyboardOpen } from '@/hooks/useKeyboardOpen';

export interface DockItem {
  value: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  isNew?: boolean;
  /** Підсвічування важливої вкладки (наприклад, відкрита каса ярмарку) */
  accent?: 'gold';
  /** Пульсуючий індикатор: каса ярмарку працює просто зараз */
  live?: boolean;
}

interface Props {
  items: DockItem[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

const TabDock = ({ items, value, onChange, className }: Props) => {
  const haptics = useHaptics();
  const isMobile = useIsMobile();
  const keyboardOpen = useKeyboardOpen();

  const select = (v: string) => {
    if (v !== value) {
      haptics.impact('light');
      onChange(v);
    }
  };

  const renderItem = (item: DockItem, compact: boolean) => {
    const Icon = item.icon;
    const activeTab = item.value === value;

    return (
      <button
        type="button"
        role="tab"
        aria-label={item.label}
        aria-selected={activeTab}
        onClick={() => select(item.value)}
        title={item.live ? 'Каса активна зараз' : item.label}
        className={cn(
          'relative flex items-center justify-center gap-2 rounded-xl select-none',
          'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.92]',
          compact
            ? 'w-full min-h-[44px] h-11 px-2'
            : 'w-full min-h-[44px] px-3.5 py-2.5 text-xs font-semibold',
          item.live && 'ring-1 ring-amber-400/60 shadow-[0_0_16px_rgba(245,158,11,0.35)]',
          activeTab
            ? 'bg-primary/15 text-primary border border-primary/30 shadow-[0_0_14px_rgba(250,90,21,0.2)]'
            : 'text-muted-foreground border border-transparent hover:text-foreground hover:bg-muted/40'
        )}
      >
        {/* Іконка вкладки */}
        <Icon
          className={cn(
            'transition-transform duration-300 shrink-0',
            compact ? 'w-5 h-5' : 'w-4 h-4',
            activeTab && 'scale-110',
            item.accent === 'gold' && 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]'
          )}
          strokeWidth={activeTab ? 2.2 : 1.75}
        />

        {/* Текстовий підпис на десктопі/планшеті */}
        {!compact && (
          <span className="truncate tracking-wide">{item.label}</span>
        )}

        {/* Пульсуючий радар-індикатор активної каси ярмарку */}
        {item.live && (
          <span className="absolute -top-1 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]" />
          </span>
        )}

        {/* Маркер нового розділу (New) */}
        {item.isNew && !item.live && (
          <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-warning animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
        )}

        {/* Лічильник сповіщень / бейдж */}
        {!!item.badge && item.badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono font-black flex items-center justify-center shadow-md border border-background">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </button>
    );
  };

  // Мобільна версія: плаваючий острівець у нижній частині екрана
  if (isMobile) {
    if (keyboardOpen) return null;

    return (
      <nav
        role="tablist"
        aria-label="Нижня панель навігації"
        className={cn(
          'fixed left-3 right-3 z-40 flex items-center justify-around gap-1 p-1.5',
          'rounded-2xl border border-white/10 bg-card/85 dark:bg-[#07090E]/90 backdrop-blur-2xl',
          'shadow-[0_12px_40px_-10px_rgba(0,0,0,0.7),_inset_0_1px_1px_rgba(255,255,255,0.15)]',
          'bottom-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-300 animate-slide-up',
          className
        )}
      >
        {items.map((i) => (
          <div key={i.value} className="flex-1 flex min-w-0">
            {renderItem(i, true)}
          </div>
        ))}
      </nav>
    );
  }

  // Десктопна / планшетна версія
  return (
    <nav
      role="tablist"
      aria-label="Панель навігації"
      className={cn(
        'flex items-center gap-1.5 p-1.5 rounded-2xl border border-border/50 bg-card/75 backdrop-blur-xl shadow-sm',
        className
      )}
    >
      {items.map((i) => (
        <div key={i.value} className="flex-1 flex min-w-0">
          {renderItem(i, false)}
        </div>
      ))}
    </nav>
  );
};

export default TabDock;
