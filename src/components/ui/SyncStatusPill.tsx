import { useEffect, useState } from 'react';
import { Check, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOfflineSync } from '@/hooks/useOfflineSync';

/** Тонкий індикатор стану синхронізації офлайн-черги. */
export default function SyncStatusPill() {
  const { online, syncing, pending } = useOfflineSync();
  const [showDone, setShowDone] = useState(false);
  const [hadPending, setHadPending] = useState(false);

  useEffect(() => {
    if (pending > 0) { setHadPending(true); return; }
    if (!hadPending) return;
    setHadPending(false);
    setShowDone(true);
    const t = setTimeout(() => setShowDone(false), 2600);
    return () => clearTimeout(t);
  }, [pending, hadPending]);

  const visible = !online || pending > 0 || showDone;
  if (!visible) return null;

  const label = !online
    ? 'Офлайн — зміни збережено'
    : pending > 0
      ? `${syncing ? 'Синхронізація' : 'Очікує синхронізації'}: ${pending}`
      : 'Всі зміни збережено';

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] -translate-x-1/2">
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border border-border/60 bg-card/85 px-3.5 py-1.5',
          'text-xs font-medium text-foreground shadow-lg backdrop-blur-xl transition-opacity duration-300',
        )}
      >
        {!online ? (
          <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
        ) : pending > 0 ? (
          <RefreshCw className={cn('h-3.5 w-3.5 text-primary', syncing && 'animate-spin')} />
        ) : (
          <Check className="h-3.5 w-3.5 text-primary" />
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}
