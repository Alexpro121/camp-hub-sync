import { lazyRetry } from '@/lib/lazyRetry';
import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import RoleSelect from '@/components/screens/RoleSelect';
import TelegramBackButton from '@/components/telegram/TelegramBackButton';
import TelegramGate from '@/components/telegram/TelegramGate';
import TelegramOnboarding from '@/components/telegram/TelegramOnboarding';
import { supabase } from '@/integrations/supabase/client';
import { clearSavedSession, getSavedRole, hasChildArchiveSnapshot } from '@/lib/session';
import { closeMiniApp, isTelegramMiniApp, telegramJoinToken, telegramSignIn, type TelegramBlockState } from '@/lib/telegramAuth';
import { FullScreenLoader } from '@/components/ui/loader';
import IntroSplash, { shouldShowIntro } from '@/components/ui/IntroSplash';
import ExitConfirm from '@/components/ExitConfirm';
import { toast } from 'sonner';

const ChildFlow = lazyRetry(() => import('@/components/screens/ChildFlow'));
const SupervisorFlow = lazyRetry(() => import('@/components/screens/SupervisorFlow'));
const AdminFlow = lazyRetry(() => import('@/components/screens/AdminFlow'));
const AlumniFlow = lazyRetry(() => import('@/components/alumni/AlumniFlow'));

export type Screen = 'role' | 'child' | 'supervisor' | 'admin' | 'alumni';

/** Головний роутер ролей проєкту «Залізна Зміна» (Учасник / Супровід / Штаб) */
const Index = () => {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>('role');
  const [exitOpen, setExitOpen] = useState(false);
  const [restoring, setRestoring] = useState<boolean>(true);
  const [showIntro, setShowIntro] = useState<boolean>(() => shouldShowIntro());
  // У Telegram роль визначає сервер за підписаним initData; вибору ролі й форм входу там немає.
  const [tgMode] = useState<boolean>(() => isTelegramMiniApp());
  const [tgBlock, setTgBlock] = useState<TelegramBlockState | null>(null);

  // Автоматичне розгортання вікна при відкритті у Telegram WebApp
  useEffect(() => {
    try {
      const tg = (window as unknown as { Telegram?: { WebApp?: { expand: () => void; ready: () => void } } })?.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }
    } catch {
      // Ігноруємо поза середовищем Telegram
    }
  }, []);

  // Відновлення сесії користувача (Safe Offline & Multi-Role Auto-Login)
  useEffect(() => {
    let cancelled = false;

    const restoreUserSession = async () => {
      try {
        // 0. Telegram Mini App: хто це — вирішує сервер (tg-auth), а не збережена роль.
        if (tgMode) {
          const join = telegramJoinToken();
          if (join) { navigate(`/staff/join/${encodeURIComponent(join)}`, { replace: true }); return; }
          const result = await telegramSignIn();
          if (cancelled) return;
          if (result.state === 'ok') {
            if (result.role === 'child') setScreen('child');
            else if (result.role === 'admin') setScreen('admin');
            else navigate('/staff', { replace: true });
          } else if (result.state === 'error' && result.offline && getSavedRole() === 'child' && hasChildArchiveSnapshot()) {
            // Немає зв'язку (наприклад, у потязі) — показуємо збережений на пристрої профіль.
            setScreen('child');
          } else {
            setTgBlock(result.state);
          }
          return;
        }

        const savedRole = getSavedRole();

        // 1. Якщо збереженої ролі немає — показуємо вибір ролі
        if (!savedRole) {
          if (!cancelled) setRestoring(false);
          return;
        }

        // 2. Відновлення кабінету УЧАСНИКА (Офлайн-паспорт)
        if (savedRole === 'child') {
          if (!cancelled) {
            setScreen('child');
            setRestoring(false);
          }
          return;
        }

        // 3. Супровід працює через /staff — на головній просто показуємо вибір ролі
        if (savedRole === 'supervisor') {
          if (!cancelled) setRestoring(false);
          return;
        }

        // 4. Відновлення кабінету АДМІНІСТРАТОРА
        if (savedRole === 'admin') {
          const { data, error } = await supabase.auth.getSession();
          if (cancelled) return;

          // Панель адміна відкриваємо лише для справжньої сесії з роллю admin,
          // інакше зміни розкладу відхиляються базою (permission denied).
          let isAdmin = false;
          const uid = !error ? data?.session?.user?.id : undefined;
          if (uid) {
            const { data: roles } = await supabase
              .from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').limit(1);
            isAdmin = !!roles?.length;
          }
          if (cancelled) return;
          if (isAdmin) {
            setScreen(savedRole);
          } else {
            clearSavedSession();
            setScreen('role');
          }
        } else {
          clearSavedSession();
          setScreen('role');
        }
      } catch (err) {
        console.error('[Index] Помилка відновлення сесії:', err);
        clearSavedSession();
        if (!cancelled) setScreen('role');
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };

    restoreUserSession();

    return () => {
      cancelled = true;
    };
  // Перевірка входу — один раз при відкритті екрана (tgMode і navigate не змінюються).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Плавна зміна екрана зі скиданням скролу
  const navigateTo = useCallback((nextScreen: Screen) => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    setScreen(nextScreen);
  }, []);

  // Вихід на головний екран вибору ролей
  const goRole = useCallback(() => {
    // У Telegram вибору ролі немає: вихід просто закриває застосунок, наступне відкриття знову спитає сервер.
    if (tgMode) { closeMiniApp(); return; }
    clearSavedSession();
    navigateTo('role');
  }, [navigateTo, tgMode]);

  // Завершення інтро-сплешу
  const handleIntroFinish = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Стан завантаження під час перевірки авторизації
  if (restoring) {
    return <FullScreenLoader label="Відновлення сесії..." />;
  }

  // Telegram без прив'язки (або на розгляді / вимкнено): жодних форм входу, лише підказка повернутись у бот.
  if (tgMode && (tgBlock || screen === 'role')) {
    // Неприв'язаний Telegram: перший вхід (дитина або реєстрація працівника) прямо в застосунку.
    if (!tgBlock || tgBlock === 'unlinked') return <TelegramOnboarding />;
    return <TelegramGate state={tgBlock} />;
  }

  return (
    <main className="min-h-[100dvh] w-full relative flex flex-col justify-between overflow-x-hidden bg-[#05070D] text-slate-100 font-sans select-none transition-colors duration-300">
      
      {/* Інтро-сплеш при першому вході */}
      {showIntro && (
        <IntroSplash onComplete={handleIntroFinish} />
      )}

      {/* Системна кнопка «Назад» для Telegram Mini App */}
      {screen !== 'role' && !tgMode && <TelegramBackButton onClick={() => setExitOpen(true)} />}
      <ExitConfirm open={exitOpen} onOpenChange={setExitOpen} onConfirm={() => {
        void supabase.auth.signOut().then(({ error }) => {
          if (error) { toast.error('Не вдалося вийти. Перевірте зв’язок і спробуйте ще раз.'); return; }
          goRole();
        }).catch(() => toast.error('Не вдалося вийти. Спробуйте ще раз.'));
      }}>{null}</ExitConfirm>

      {/* Роутинг між екранами з плавною появою */}
      <div className="w-full flex-1 flex flex-col animate-fade-in">
          <Suspense fallback={<FullScreenLoader label="Відкриваємо кабінет..." />}>
        {screen === 'role' && (
          <RoleSelect onSelect={(selectedRole) => navigateTo(selectedRole)} />
        )}

        {screen === 'child' && (
          <ChildFlow onBack={goRole} telegramMode={tgMode} />
        )}

        {screen === 'supervisor' && (
          <SupervisorFlow
            onBack={goRole}
            onAdminUnlock={() => navigateTo('admin')}
          />
        )}

        {screen === 'admin' && (
          <AdminFlow onBack={goRole} />
        )}

        {screen === 'alumni' && (
          <AlumniFlow onBack={() => navigateTo('role')} />
        )}
          </Suspense>
      </div>

    </main>
  );
};

export default Index;
