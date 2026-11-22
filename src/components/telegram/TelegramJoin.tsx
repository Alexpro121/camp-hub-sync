import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import TelegramGate from '@/components/telegram/TelegramGate';
import TelegramOnboarding from '@/components/telegram/TelegramOnboarding';
import { telegramSignIn, type TelegramBlockState } from '@/lib/telegramAuth';

/**
 * Посилання зміни для супроводу всередині Telegram (/staff/join/<код>, бот: ?start=join_<код>).
 * Уже підтверджений працівник одразу обирає команду; новий — коротка реєстрація за цим же посиланням, потім вибір команди.
 */
const TelegramJoin = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<TelegramBlockState | 'loading' | 'child'>('loading');

  useEffect(() => {
    let cancelled = false;
    telegramSignIn().then((r) => {
      if (cancelled) return;
      if (r.state === 'ok') {
        if (r.role === 'child') setState('child');
        else navigate(`/staff?pick=${encodeURIComponent(token)}`, { replace: true });
      } else setState(r.state);
    });
    return () => { cancelled = true; };
  }, [navigate, token]);

  if (state === 'loading') {
    return <main className="min-h-[100dvh] flex items-center justify-center bg-[#05070D]"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></main>;
  }
  if (state === 'unlinked') return <TelegramOnboarding join={token} />;
  if (state === 'child') return <TelegramGate state="revoked" text="Це посилання для супроводу. Цей Telegram прив'язаний до профілю учасника." />;
  return <TelegramGate state={state} />;
};

export default TelegramJoin;
