import { lazy, type ComponentType } from 'react';

const KEY = 'chunk-reload-at';

/** lazy() з повторами: після оновлення старі файли зникають — пробуємо ще раз, потім одноразово перезавантажуємо сторінку. */
export function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    for (let i = 0; i < 3; i++) {
      try {
        const m = await factory();
        sessionStorage.removeItem(KEY);
        return m;
      } catch (e) {
        if (i < 2) { await new Promise((r) => setTimeout(r, 400 * (i + 1))); continue; }
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (navigator.onLine && Date.now() - last > 30000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
        throw e;
      }
    }
    throw new Error('unreachable');
  });
}
