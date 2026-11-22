import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { applyPendingUpdate, applyUpdateOnAuthChange } from '@/lib/registerSW';

/**
 * Нова версія застосунку — обов'язкова: вікно на весь екран, закрити його не можна, лише «Оновити».
 * Без взаємодії версія ставиться сама: при запуску, коли застосунок згортають чи закривають,
 * і при вході або виході з акаунта (див. registerSW). Дані на пристрої (сесія, профіль, черга стійки,
 * чернетки) переживають перезавантаження.
 */
const AppUpdatePrompt = () => {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onNeed = () => setVisible(true);
    window.addEventListener('pwa-need-refresh', onNeed);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') applyUpdateOnAuthChange();
    });
    return () => {
      window.removeEventListener('pwa-need-refresh', onNeed);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!visible) return null;

  const update = () => {
    setBusy(true);
    applyPendingUpdate();
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#05070D]/95 backdrop-blur-xl px-6 safe-top"
    >
      <div className="w-full max-w-sm text-center space-y-4 text-slate-100">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100/10 grid place-items-center">
          <RefreshCw className={`w-7 h-7 ${busy ? 'animate-spin' : ''}`} />
        </div>
        <h2 id="app-update-title" className="text-xl font-black tracking-tight">Потрібне оновлення</h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          Вийшла нова версія застосунку. Оновіться, щоб продовжити — усі твої дані збережуться.
        </p>
        <button
          type="button"
          onClick={update}
          disabled={busy}
          className="w-full min-h-[48px] rounded-xl bg-slate-100 text-slate-900 font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {busy ? 'Оновлюємо…' : 'Оновити'}
        </button>
      </div>
    </div>
  );
};

export default AppUpdatePrompt;
