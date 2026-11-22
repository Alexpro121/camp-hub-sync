/**
 * Єдина точка реєстрації Service Worker для проєкту «Залізна Зміна».
 * Забезпечує роботу PWA, кешування ассетів та офлайн-паспорта в потягах УЗ і Карпатах.
 */

const APP_SW_URL = '/sw.js';

let swRegistration: ServiceWorkerRegistration | null = null;

/* ----------------------------- оновлення застосунку ----------------------------- */

/** Скільки після запуску вважаємо «щойно увійшли»: нова версія ставиться одразу, ще до роботи. */
const STARTUP_WINDOW_MS = 10_000;
/** Якщо service worker не перезавантажив сторінку сам — перезавантажуємо через цей час. */
const RELOAD_FALLBACK_MS = 6_000;
const loadedAt = Date.now();
/** Позначка останнього автооновлення: якщо нова версія чомусь не стала, не крутимо перезавантаження по колу. */
const AUTO_APPLY_KEY = 'ironshift:sw-auto-update-at';
const recentlyAutoApplied = (): boolean => {
  try { return Date.now() - Number(sessionStorage.getItem(AUTO_APPLY_KEY) || 0) < 60_000; } catch { return false; }
};
const markAutoApplied = () => { try { sessionStorage.setItem(AUTO_APPLY_KEY, String(Date.now())); } catch { /* приватний режим */ } };

let pendingUpdate: (() => void) | null = null;
let applying = false;

export const hasPendingUpdate = (): boolean => pendingUpdate !== null;

/**
 * Ставить нову версію: активує новий service worker і перезавантажує сторінку.
 * Дані (сесія, профіль, черга стійки, чернетки) лежать на пристрої й переживають перезавантаження.
 */
export function applyPendingUpdate(): void {
  if (applying) return;
  applying = true;
  try { pendingUpdate?.(); } catch { /* перезавантажимо нижче */ }
  setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
}

/** Автооновлення без натискання (вхід, вихід, згортання). Повертає false, якщо його щойно пробували. */
function autoApply(): boolean {
  if (!pendingUpdate || recentlyAutoApplied()) return false;
  markAutoApplied();
  applyPendingUpdate();
  return true;
}

/** Нова версія готова: ставимо одразу, якщо зараз зручний момент, інакше — обов'язкове вікно «Оновити». */
function onUpdateReady(update: () => void) {
  pendingUpdate = update;
  // Вхід у застосунок: щойно відкрили (або сторінка у фоні) — оновлюємо без питань.
  const startup = Date.now() - loadedAt < STARTUP_WINDOW_MS;
  if ((startup || document.visibilityState === 'hidden') && autoApply()) return;
  window.dispatchEvent(new CustomEvent('pwa-need-refresh', { detail: { update: applyPendingUpdate } }));
}

let lifecycleHooked = false;
/** Вихід/повернення в застосунок: оновлюємося, поки людина не працює з екраном. */
function hookUpdateLifecycle(registration: ServiceWorkerRegistration) {
  if (lifecycleHooked) return;
  lifecycleHooked = true;
  const check = () => { if (navigator.onLine) registration.update().catch(() => {}); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Згорнули застосунок або закрили Mini App — найкращий момент поставити нову версію.
      autoApply();
    } else {
      // Повернулися — одразу питаємо сервер, чи нема нової версії.
      check();
    }
  });
  window.addEventListener('pagehide', () => { autoApply(); });
  window.addEventListener('online', check);
  setInterval(check, 10 * 60 * 1000);
}

/**
 * Вхід або вихід з акаунта: якщо чекає нова версія — ставимо її зараз.
 * Невелика пауза, щоб застосунок встиг зберегти сесію і роль на пристрої.
 */
export function applyUpdateOnAuthChange(): void {
  if (!pendingUpdate) return;
  setTimeout(() => { autoApply(); }, 1500);
}

/**
 * Перевіряє, чи не запущено додаток у тестовому або заблокованому середовищі
 */
function isBlockedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === 'undefined') return true;

  // Ручне вимкнення через URL параметр (?sw=off)
  if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;

  const h = window.location.hostname;

  // Блокування на тестових хостах та прев'ю-стендах Lovable
  if (
    h.startsWith('id-preview--') ||
    h.startsWith('preview--') ||
    h === 'lovableproject.com' ||
    h.endsWith('.lovableproject.com') ||
    h === 'lovableproject-dev.com' ||
    h.endsWith('.lovableproject-dev.com') ||
    h === 'beta.lovable.dev' ||
    h.endsWith('.beta.lovable.dev')
  ) {
    return true;
  }

  // Захист від звичайних iframe, але з повною підтримкою Telegram WebApp у фреймі
  if (window.self !== window.top) {
    const isTelegramWebApp =
      typeof (window as any).Telegram?.WebApp !== 'undefined' ||
      window.location.hash.includes('tgWebAppData') ||
      window.location.search.includes('tgWebApp');

    if (!isTelegramWebApp) return true;
  }

  return false;
}

/**
 * Повне видалення застарілих або конфліктних Service Worker
 */
export async function unregisterAppSW(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(regs.map((r) => r.unregister()));
    swRegistration = null;
  } catch {
    /* ігноруємо помилки при розреєстрації */
  }
}

/**
 * Головна функція реєстрації Service Worker
 */
export async function registerAppServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  if (isBlockedContext()) {
    await unregisterAppSW().catch(() => {});
    return;
  }

  try {
    // 1. Спроба реєстрації через плагін vite-plugin-pwa
    const { registerSW } = await import('virtual:pwa-register');

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        onUpdateReady(() => { void updateSW(true); });
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
      },
      onRegisteredSW(swUrl, registration) {
        swRegistration = registration || null;

        // Перевірка нових версій: при поверненні в застосунок, появі інтернету і раз на 10 хвилин.
        if (registration) hookUpdateLifecycle(registration);
      },
      onRegisterError(error) {
        console.warn('[PWA] Registration error:', error);
      },
    });
  } catch {
    // 2. Резервна (Fallback) реєстрація безпосередньо через браузерне API
    try {
      const reg = await navigator.serviceWorker.register(APP_SW_URL, { scope: '/' });
      swRegistration = reg;
      hookUpdateLifecycle(reg);

      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdateReady(() => {
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              });
            }
          });
        }
      });
    } catch (fallbackErr) {
      console.warn('[PWA] Native registration fallback failed:', fallbackErr);
    }
  }
}

/**
 * Ручна перевірка наявності оновлення (наприклад, по кнопці в налаштуваннях)
 */
export async function checkForAppUpdate(): Promise<boolean> {
  if (!swRegistration) return false;
  try {
    await swRegistration.update();
    return true;
  } catch {
    return false;
  }
}
