import { useEffect, useState } from 'react';
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
  const [restoring, setRestoring] = useState(true);
  const [intro, setIntro] = useState(() => shouldShowIntro());


  // Auto-login: reopen the saved cabinet when a backend session is still valid.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedRole = getSavedRole();
      if (!savedRole) { if (!cancelled) setRestoring(false); return; }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setScreen(savedRole);
      else clearSavedSession();
      setRestoring(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const goRole = () => {
    clearSavedSession();
    setScreen('role');
  };

  if (restoring) return <FullScreenLoader label="Відновлення сесії" />;

  return (
    <main className="min-h-screen w-full">
      {/* Native Telegram back button — only visible when not on root screen */}
      {screen !== 'role' && <TelegramBackButton onClick={goRole} />}

      {screen === 'role' && <RoleSelect onSelect={setScreen} />}
      {screen === 'child' && <ChildFlow onBack={goRole} />}
      {screen === 'supervisor' && (
        <SupervisorFlow
          onBack={goRole}
          onAdminUnlock={() => setScreen('admin')}
        />
      )}
      {screen === 'admin' && <AdminFlow onBack={goRole} />}
    </main>
  );
};

export default Index;
