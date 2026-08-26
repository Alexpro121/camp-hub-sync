/**
 * Єдина точка реєстрації service worker.
 * У прев'ю/дев-режимі реєстрація заборонена — інакше браузер віддає
 * застарілий HTML і чанки, яких уже немає.
 */
const APP_SW_URL = '/sw.js';

function isBlockedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === 'undefined') return true;
  if (window.self !== window.top) return true;
  const h = window.location.hostname;
  if (h.startsWith('id-preview--') || h.startsWith('preview--')) return true;
  if (h === 'lovableproject.com' || h.endsWith('.lovableproject.com')) return true;
  if (h === 'lovableproject-dev.com' || h.endsWith('.lovableproject-dev.com')) return true;
  if (h === 'beta.lovable.dev' || h.endsWith('.beta.lovable.dev')) return true;
  if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;
  return false;
}

async function unregisterAppSW() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => (r.active?.scriptURL || r.waiting?.scriptURL || '').endsWith(APP_SW_URL))
      .map((r) => r.unregister()),
  );
}

export async function registerAppServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (isBlockedContext()) {
    await unregisterAppSW().catch(() => { /* ignore */ });
    return;
  }
  try {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  } catch { /* офлайн-кеш недоступний */ }
}
