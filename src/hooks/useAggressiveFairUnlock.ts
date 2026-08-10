import { useEffect, useRef } from 'react';
import { useFairAccess, type FairAccess } from './useFairAccess';
import { pushIsland } from '@/lib/islandBus';

/**
 * Aggressive fair unlock: the moment a `category === 'fair'` event (or an event
 * named "Ярмарок") enters its minute, the golden tab is unlocked everywhere and
 * a Dynamic Island announcement fires once. The mode never turns off before the
 * exact end minute of the schedule event.
 */
export function useAggressiveFairUnlock(enabled = true): FairAccess {
  const access = useFairAccess(enabled);
  const announced = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (access.isLiveFairRunning && !announced.current) {
      announced.current = true;
      pushIsland(
        '🛍️ Розпочалася Ярмарка! Торгівлю та каси стендів відкрито.',
        'gradient',
        'Ярмарок',
        9000,
      );
    }
    if (!access.isLiveFairRunning) announced.current = false;
  }, [enabled, access.isLiveFairRunning]);

  return access;
}