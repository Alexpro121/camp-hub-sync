import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import RoleSelect from '@/components/screens/RoleSelect';
import TelegramBackButton from '@/components/telegram/TelegramBackButton';
import { supabase } from '@/integrations/supabase/client';
import { clearSavedSession, getSavedRole } from '@/lib/session';
import { FullScreenLoader } from '@/components/ui/loader';
import IntroSplash, { shouldShowIntro } from '@/components/ui/IntroSplash';

const ChildFlow = lazy(() => import('@/components/screens/ChildFlow'));
const SupervisorFlow = lazy(() => import('@/components/screens/SupervisorFlow'));
const AdminFlow = lazy(() => import('@/components/screens/AdminFlow'));
const ParentFlow = lazy(() => import('@/components/screens/ParentFlow'));
const AlumniFlow = lazy(() => import('@/components/alumni/AlumniFlow'));

export type Screen = 'role' | 'child' | 'supervisor' | 'admin' | 'alumni' | 'parent';

/** Головний роутер ролей проєкту «Залізна Зміна» (Учасник / Супровід / Штаб) */
const Index = () => {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>('role');
  const [restoring, setRestoring] = useState<boolean>(true);
  const [showIntro, setShowIntro] = useState<boolean>(() => shouldShowIntro());

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

        if (savedRole === 'parent') {
          if (!cancelled) { setScreen('parent'); setRestoring(false); }
          return;
        }

        // 3. Супровід тепер працює лише через окреме посилання /staff
        if (savedRole === 'supervisor') {
          navigate('/staff', { replace: true });
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
            navigate('/staff', { replace: true });
            return;
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
    clearSavedSession();
    navigateTo('role');
  }, [navigateTo]);

  // Завершення інтро-сплешу
  const handleIntroFinish = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Стан завантаження під час перевірки авторизації
  if (restoring) {
    return <FullScreenLoader label="Відновлення сесії..." />;
  }

  return (
    <main className="min-h-[100dvh] w-full relative flex flex-col justify-between overflow-x-hidden bg-[#05070D] text-slate-100 font-sans select-none transition-colors duration-300">
      
      {/* Інтро-сплеш при першому вході */}
      {showIntro && (
        <IntroSplash onComplete={handleIntroFinish} />
      )}

      {/* Системна кнопка «Назад» для Telegram Mini App */}
      {screen !== 'role' && <TelegramBackButton onClick={goRole} />}

      {/* Роутинг між екранами з плавною появою */}
      <div className="w-full flex-1 flex flex-col animate-fade-in">
          <Suspense fallback={<FullScreenLoader label="Відкриваємо кабінет..." />}>
        {screen === 'role' && (
          <RoleSelect onSelect={(selectedRole) => navigateTo(selectedRole)} />
        )}

        {screen === 'child' && (
          <ChildFlow onBack={goRole} />
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

        {screen === 'parent' && (
          <ParentFlow onBack={goRole} />
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
