import { useEffect, useState } from 'react';
import { kickFlush, onQueueChange } from '@/lib/offline';
import { outbox } from '@/lib/outboxEngine';

export interface OfflineSyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
}

/**
 * Єдиний менеджер синхронізації офлайн-черг.
 * Скидає чергу негайно: при поверненні мережі, поверненні на вкладку,
 * при монтуванні та кожні 10 секунд як страховка.
 */
export function useOfflineSync(): OfflineSyncState {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [queueCount, setQueueCount] = useState(0);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const [outboxState, setOutboxState] = useState({ pending: 0, syncing: false });

  useEffect(() => {
    const offQueue = onQueueChange((q, s) => { setQueueCount(q.length); setQueueSyncing(s); });
    const offOutbox = outbox.subscribe((s) => setOutboxState({ pending: s.pending, syncing: s.syncing }));
    return () => { offQueue(); offOutbox(); };
  }, []);

  useEffect(() => {
    const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

    const sync = () => {
      if (isOffline()) return;
      void kickFlush().catch(() => {});
      void outbox.kick().catch(() => {});
    };

    const goOnline = () => { setOnline(true); sync(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);

    sync();
    const timer = setInterval(sync, 10000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  return {
    online,
    syncing: queueSyncing || outboxState.syncing,
    pending: queueCount + outboxState.pending,
  };
}
