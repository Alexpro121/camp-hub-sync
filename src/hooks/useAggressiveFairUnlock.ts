import { useEffect, useRef } from 'react';
import { useFairAccess, type FairAccess } from './useFairAccess';
import { pushIsland } from '@/lib/islandBus';

/** Глобальний прапорець для запобігання дублюванню сповіщень між компонентами */
let globalFairAnnounced = false;

/**
 * Хук агресивного розблокування ярмарку:
 * Щойно настає час події з категорією 'fair' або назвою "Ярмарок",
 * золота вкладка миттєво відкривається для всіх, а в Dynamic Island
 * надсилається єдине чітке системне сповіщення.
 */
export function useAggressiveFairUnlock(enabled = true): FairAccess {
  const access = useFairAccess(enabled);
  const localAnnounced = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Якщо ярмарок відкрився і сповіщення ще не було відправлено
    if (access.isLiveFairRunning && !localAnnounced.current && !globalFairAnnounced) {
      localAnnounced.current = true;
      globalFairAnnounced = true;

      pushIsland(
        'Розпочався ярмарок! Торгівлю та каси стендів відкрито.',
        'warning',
        'Ярмарок',
        9000
      );
    }

    // Скидаємо прапорці після завершення ярмарку
    if (!access.isLiveFairRunning) {
      localAnnounced.current = false;
      globalFairAnnounced = false;
    }
  }, [enabled, access.isLiveFairRunning]);

  return access;
}

export default useAggressiveFairUnlock;
