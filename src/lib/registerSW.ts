/**
 * Єдина точка реєстрації Service Worker для проєкту «Залізна Зміна».
 * Забезпечує роботу PWA та офлайн-паспорта в потягах УЗ і Карпатах.
 *
 * У прев'ю/дев-режимі реєстрація заборонена — інакше браузер віддає
 * застарілий HTML і чанки, яких уже немає.
 */
const APP_SW_URL = '/sw.js';

function isBlockedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === 'undefined') return true;

  // Якщо відкритий явний параметр примусового вимкнення SW
  if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;

  const h = window.location.hostname;

  // Блокування на тестових хостах та прев'ю Lovable
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

  // Захист від прев'ю-фреймів, але з підтримкою Telegram WebApp у фреймі
  if (window.self !== window.top) {
    const isTelegramWebApp = typeof (window as any).Telegram?.WebApp !== 'undefined';
    if (!isTelegramWebApp) return true;
  }

  return false;
}

async function unregisterAppSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(regs.map((r) => r.unregister()));
  } catch {
    /* ignore unregister errors */
  }
}

export async function registerAppServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  if (isBlockedContext()) {
    await unregisterAppSW().catch(() => { /* ignore */ });
    return;
  }

  try {
    const { registerSW } = await import('virtual:pwa-register');
    
    // Автоматичне оновлення кешу при новому деплої
    registerSW({
      immediate: true,
      onNeedRefresh() {
        // При появі нової версії на Vercel — плавно оновлюємо сторінку
        window.location.reload();
      },
      onRegisterError(error) {
        console.warn('PWA registration error:', error);
      },
    });
  } catch {
    /* офлайн-кеш PWA недоступний у цьому браузері */
  }
}
