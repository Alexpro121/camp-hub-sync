import { useEffect, useState } from 'react';
import { flushQueue, onQueueChange, type QueuedAction } from '@/lib/offline';
import { pushIsland } from '@/lib/islandBus';

export type NetState = 'online' | 'offline' | 'syncing';

export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const off = onQueueChange((q, s) => { setQueue(q); setSyncing(s); });
    return () => { off(); };
  }, []);

  useEffect(() => {
    const sync = async () => {
      const res = await flushQueue();
      if (res.done > 0) pushIsland(`Синхронізовано ${res.done} дій`, 'success');
      if (res.failed > 0) pushIsland(`${res.failed} дій чекають на мережу`, 'warning');
    };
    const goOnline = () => { setOnline(true); pushIsland('Зв\u2019язок відновлено', 'success'); sync(); };
    const goOffline = () => { setOnline(false); pushIsland('Офлайн — дії зберігаються локально', 'warning'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine) sync();
    const t = setInterval(() => { if (navigator.onLine) flushQueue(); }, 15000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(t);
    };
  }, []);

  const state: NetState = !online ? 'offline' : syncing ? 'syncing' : 'online';
  return { state, online, syncing, pending: queue.length };
}