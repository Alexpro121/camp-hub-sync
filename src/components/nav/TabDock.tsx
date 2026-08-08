import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { useIsMobile } from '@/hooks/use-mobile';

export interface DockItem {
  value: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  isNew?: boolean;
  /** Highlights a live, time-critical tab (e.g. the fair cash register). */
  accent?: 'gold';
  /** Pulsing golden indicator: the fair cash register is open right now. */
  live?: boolean;
}

interface Props {
  items: DockItem[];
  value: string;
  onChange: (v: string) => void;
}

const EASE = 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

const TabDock = ({ items, value, onChange }: Props) => {
  const haptics = useHaptics();
  const isMobile = useIsMobile();

  const select = (v: string) => {
    if (v !== value) haptics.impact('light');
    onChange(v);
  };

  const Item = ({ item, compact }: { item: DockItem; compact: boolean }) => {
    const Icon = item.icon;
    const activeTab = item.value === value;
    return (
      <button
        key={item.value}
        type="button"
        aria-label={item.label}
        aria-current={activeTab ? 'page' : undefined}
        onClick={() => select(item.value)}
        title={item.live ? 'Каса відкрита' : item.label}
        className={cn(
          'relative flex items-center justify-center gap-1.5 rounded-xl active:scale-90 transition-transform',
          EASE,
          compact
            ? 'flex-1 min-w-[44px] min-h-[44px] h-11'
            : 'flex-1 min-h-[44px] px-3 py-2 text-xs font-medium',
          item.live && 'ring-1 ring-amber-400/60 shadow-[0_0_14px_rgba(245,158,11,0.35)]',
          activeTab
            ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
            : 'text-muted-foreground border border-transparent hover:text-foreground hover:bg-muted/40',
        )}
      >
        <Icon
          className={cn(
            compact ? 'w-[20px] h-[20px]' : 'w-[18px] h-[18px]',
            item.accent === 'gold' && 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)]',
          )}
          strokeWidth={1.9}
        />
        {!compact && <span className="truncate">{item.label}</span>}
        {item.live && (
          <span className="absolute -top-1 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)] animate-pulse" />
        )}
        {item.isNew && (
          <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-warning animate-pulse" />
        )}
        {!!item.badge && item.badge > 0 && (
          <span className="absolute -top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </button>
    );
  };

  if (isMobile) {
    return (
      <nav
        className="fixed bottom-3 left-3 right-3 z-50 flex items-center justify-around gap-1 rounded-2xl border border-border/60 bg-card/90 backdrop-blur-xl shadow-2xl p-1.5"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      >
        {items.map((i) => (
          <div key={i.value} className="flex-1 flex animate-fade-in">
            <Item item={i} compact />
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1 rounded-2xl border border-border/50 bg-card/70 backdrop-blur-xl p-1.5">
      {items.map((i) => (
        <div key={i.value} className="flex-1 flex animate-fade-in">
          <Item item={i} compact={false} />
        </div>
      ))}
    </nav>
  );
};

export default TabDock;