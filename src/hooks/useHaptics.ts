import { getTg } from './useTelegramWebApp';

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

const fallbackVibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
};

/** Telegram haptics with graceful fallback to navigator.vibrate on web. */
export const useHaptics = () => {
  const impact = (style: ImpactStyle = 'light') => {
    const tg = getTg();
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.impactOccurred(style); return; } catch { /* fallthrough */ }
    }
    fallbackVibrate(style === 'heavy' ? 25 : style === 'medium' ? 15 : 8);
  };

  const notification = (type: NotificationType = 'success') => {
    const tg = getTg();
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.notificationOccurred(type); return; } catch { /* fallthrough */ }
    }
    fallbackVibrate(type === 'error' ? [20, 40, 20] : type === 'warning' ? [15, 30] : 12);
  };

  const selection = () => {
    const tg = getTg();
    if (tg?.HapticFeedback) {
      try { tg.HapticFeedback.selectionChanged(); return; } catch { /* fallthrough */ }
    }
    fallbackVibrate(5);
  };

  return { impact, notification, selection };
};
