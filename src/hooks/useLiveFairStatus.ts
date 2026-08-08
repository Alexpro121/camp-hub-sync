import { useEffect, useState } from 'react';
import { isFairCurrentlyActive } from '@/lib/fair-resolver';
import type { ScheduleItem } from '@/types/app';

/**
 * Live fair status: re-checks the clock every 3 seconds so the "Ярмарок" tab
 * appears the second the event starts — no page refresh needed.
 */
export function useLiveFairStatus(
  itemsByDate: { date: string; items: ScheduleItem[] }[],
): boolean {
  const [isFairActive, setIsFairActive] = useState(false);

  useEffect(() => {
    const check = () => setIsFairActive(isFairCurrentlyActive(itemsByDate, new Date()));
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [itemsByDate]);

  return isFairActive;
}
