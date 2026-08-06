import { useEffect } from 'react';
import { getTg } from '@/hooks/useTelegramWebApp';

interface Props {
  onClick: () => void;
  visible?: boolean;
}

/**
 * Renders nothing — just wires the native Telegram BackButton to a handler.
 * No-ops outside Telegram.
 */
const TelegramBackButton = ({ onClick, visible = true }: Props) => {
  useEffect(() => {
    const tg = getTg();
    if (!tg?.BackButton) return;
    if (visible) tg.BackButton.show();
    else tg.BackButton.hide();
    tg.BackButton.onClick(onClick);
    return () => {
      try { tg.BackButton.offClick(onClick); } catch { /* ignore */ }
      try { tg.BackButton.hide(); } catch { /* ignore */ }
    };
  }, [onClick, visible]);

  return null;
};

export default TelegramBackButton;
