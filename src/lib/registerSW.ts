/**
 * Єдина точка реєстрації Service Worker для проєкту «Залізна Зміна».
 * Забезпечує роботу PWA, кешування ассетів та офлайн-паспорта в потягах УЗ і Карпатах.
 */

const APP_SW_URL = '/sw.js';

let swRegistration: ServiceWorkerRegistration | null = null;

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
        // Сповіщаємо додаток про нову версію через CustomEvent
        // Замість раптового window.location.reload() даємо можливість зберегти форму
        window.dispatchEvent(
          new CustomEvent('pwa-need-refresh', {
            detail: {
              update: () => updateSW(true),
            },
          })
        );
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
      },
      onRegisteredSW(swUrl, registration) {
        swRegistration = registration || null;

        if (registration) {
          // Автоматична перевірка оновлень на станціях, коли з'являється інтернет
          window.addEventListener('online', () => {
            registration.update().catch(() => {});
          });

          // Періодична м'яка перевірка раз на 30 хвилин
          setInterval(() => {
            if (navigator.onLine) {
              registration.update().catch(() => {});
            }
          }, 30 * 60 * 1000);
        }
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

      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(
                new CustomEvent('pwa-need-refresh', {
                  detail: {
                    update: () => {
                      installingWorker.postMessage({ type: 'SKIP_WAITING' });
                      window.location.reload();
                    },
                  },
                })
              );
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
