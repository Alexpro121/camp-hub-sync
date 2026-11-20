import { networkPulse } from './networkEngine';

let warmed = false;

/**
 * Тихо підтягує важкі частини застосунку (сертифікат тощо), щоб вони працювали без мережі пізніше.
 * Лише на швидкому з'єднанні й коли телефон вільний: на слабкому спільному Wi-Fi (потяг)
 * нічого не качаємо — канал потрібен для розкладу й черги дій.
 */
export function warmWhenFast(loaders: Array<() => Promise<unknown>>, delayMs = 15_000): () => void {
  if (warmed || typeof window === 'undefined') return () => {};
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  const attempt = () => {
    if (cancelled || warmed) return;
    const { quality, saveData } = networkPulse.state;
    if (quality !== 'ONLINE_FAST' || saveData || document.visibilityState !== 'visible') {
      timer = setTimeout(attempt, 60_000);
      return;
    }
    warmed = true;
    void (async () => {
      for (const load of loaders) {
        if (cancelled) return;
        try { await load(); } catch { warmed = false; return; }
      }
    })();
  };
  timer = setTimeout(attempt, delayMs);
  return () => { cancelled = true; clearTimeout(timer); };
}
