import { useState } from 'react';
import RoleSelect from '@/components/screens/RoleSelect';
import ChildFlow from '@/components/screens/ChildFlow';
import SupervisorFlow from '@/components/screens/SupervisorFlow';
import AdminFlow from '@/components/screens/AdminFlow';
import TelegramBackButton from '@/components/telegram/TelegramBackButton';
import DynamicIsland from '@/components/island/DynamicIsland';

export type Screen = 'role' | 'child' | 'supervisor' | 'admin';

const Index = () => {
  const [screen, setScreen] = useState<Screen>('role');
  const goRole = () => setScreen('role');

  return (
    <main className="min-h-screen w-full">
      <DynamicIsland />
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
