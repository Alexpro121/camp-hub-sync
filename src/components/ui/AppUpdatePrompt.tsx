import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Показує «Доступна нова версія» — раніше подія оновлення ніким не слухалась,
 * і телефони роками лишались на старій версії. Дані (профіль, паспорт, черга)
 * зберігаються на пристрої, тож перезапуск їх не зачіпає.
 */
const AppUpdatePrompt = () => {
  useEffect(() => {
    const onNeed = (e: Event) => {
      const update = (e as CustomEvent<{ update?: () => void }>).detail?.update;
      toast('Доступна нова версія застосунку', {
        id: 'app-update',
        duration: Infinity,
        description: 'Твої дані збережуться.',
        action: { label: 'Оновити', onClick: () => (update ? update() : window.location.reload()) },
      });
    };
    window.addEventListener('pwa-need-refresh', onNeed);
    return () => window.removeEventListener('pwa-need-refresh', onNeed);
  }, []);
  return null;
};

export default AppUpdatePrompt;
