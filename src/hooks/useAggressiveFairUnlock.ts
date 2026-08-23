import { useEffect, useRef } from 'react';
import { useFairAccess, type FairAccess } from './useFairAccess';
import { pushIsland } from '@/lib/islandBus';

/** Глобальний прапорець для уникнення дублювання сповіщень */
let globalFairAnnounced = false;

/**
 * Хук автоматичного розблокування ярмарку та красивого сповіщення в Dynamic Island.
 */
export function useAggressiveFairUnlock(enabled = true): FairAccess {
  const access = useFairAccess(enabled);
  const localAnnounced = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Відправляємо чітке сповіщення без обрізання тексту та без червоної помилки
    if (access.isLiveFairRunning && !localAnnounced.current && !globalFairAnnounced) {
      localAnnounced.current = true;
      globalFairAnnounced = true;

      pushIsland(
        'Ярмарок відкрито!',
        'success',
        'Торгівлю та каси стендів запущено',
        8000
      );
    }

    if (!access.isLiveFairRunning) {
      localAnnounced.current = false;
      globalFairAnnounced = false;
    }
  }, [enabled, access.isLiveFairRunning]);

  return access;
}

export default useAggressiveFairUnlock;
