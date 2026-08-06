import { useEffect, useState } from 'react';
import type { TelegramWebApp, TelegramWebAppUser } from '@/types/telegram';

export const getTg = (): TelegramWebApp | null => {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
};

export const isInTelegram = (): boolean => {
  const tg = getTg();
  // Heuristic: real Telegram clients always populate platform (e.g. 'ios', 'android', 'tdesktop')
  return Boolean(tg && tg.platform && tg.platform !== 'unknown');
};

/**
 * Initialize the Telegram Web App once (idempotent).
 * - Marks ready, expands, locks vertical swipes, applies theme colors.
 */
let initialized = false;
export const initTelegramWebApp = () => {
  if (initialized) return;
  const tg = getTg();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
    if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#0d1424');
    if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#0d1424');

    // Track viewport for keyboard-aware layouts
    const applyViewport = () => {
      const h = tg.viewportStableHeight || tg.viewportHeight;
      if (h) document.documentElement.style.setProperty('--tg-viewport', `${h}px`);
    };
    applyViewport();
    if (typeof tg.onEvent === 'function') {
      tg.onEvent('viewportChanged', applyViewport);
    }
    initialized = true;
  } catch (e) {
    console.warn('Telegram WebApp init failed:', e);
  }
};

/** Hook that returns the live Telegram WebApp instance (or null when outside Telegram). */
export const useTelegramWebApp = () => {
  const [tg] = useState<TelegramWebApp | null>(() => getTg());
  useEffect(() => {
    initTelegramWebApp();
  }, []);
  return tg;
};

export const getTelegramUser = (): TelegramWebAppUser | undefined => {
  return getTg()?.initDataUnsafe?.user;
};
