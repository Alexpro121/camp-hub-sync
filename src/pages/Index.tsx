import { useEffect, useState, useCallback } from 'react';
import RoleSelect from '@/components/screens/RoleSelect';
import ChildFlow from '@/components/screens/ChildFlow';
import SupervisorFlow from '@/components/screens/SupervisorFlow';
import AdminFlow from '@/components/screens/AdminFlow';
import TelegramBackButton from '@/components/telegram/TelegramBackButton';
import { supabase } from '@/integrations/supabase/client';
import { clearSavedSession, getSavedRole } from '@/lib/session';
import { FullScreenLoader } from '@/components/ui/loader';
import IntroSplash, { shouldShowIntro } from '@/components/ui/IntroSplash';

export type Screen = 'role' | 'child' | 'supervisor' | 'admin';

const Index = () => {
  const [screen, setScreen] = useState<Screen>('role');
  const [restoring, setRestoring] = useState<boolean>(true);
  const [showIntro, setShowIntro] = useState<boolean>(() => shouldShowIntro());

  // Автоматичне розгортання вікна при відкритті у Telegram
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

  // Відновлення сесії користувача (Auto-login)
  useEffect(() => {
    let cancelled = false;

    const restoreUserSession = async () => {
      try {
        const savedRole = getSavedRole();
        
        // Якщо роль не збережена — одразу показуємо вибір ролі
        if (!savedRole) {
          if (!cancelled) setRestoring(false);
          return;
        }

        // Перевіряємо валідність бекенд-сесії Supabase
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        const validRoles: Screen[] = ['child', 'supervisor', 'admin'];

        if (!error && data?.session && validRoles.includes(savedRole as Screen)) {
          setScreen(savedRole as Screen);
        } else {
          // Якщо сесія прострочена або недійсна — очищаємо
          clearSavedSession();
          setScreen('role');
        }
      } catch (err) {
        console.error('[Index] Помилка відновлення сесії:', err);
        clearSavedSession();
        setScreen('role');
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
    return <FullScreenLoader label="Відновлення сесії" />;
  }

  return (
    <main className="min-h-[100dvh] w-full relative flex flex-col justify-between overflow-x-hidden bg-background text-foreground transition-colors duration-300">
      
      {/* Інтро-сплеш при першому вході */}
      {showIntro && (
        <IntroSplash 
          onFinish={handleIntroFinish} 
          onDone={handleIntroFinish} 
        />
      )}

      {/* Системна кнопка «Назад» для Telegram Mini App */}
      {screen !== 'role' && <TelegramBackButton onClick={goRole} />}

      {/* Роутинг між екранами з плавною появою */}
      <div className="w-full flex-1 flex flex-col animate-fade-in">
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
      </div>

    </main>
  );
};

export default Index;
