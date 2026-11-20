import { beforeEach, describe, expect, it } from 'vitest';
import { readCache, signalWindowMs, spreadDelay, writeCache } from './lightSync';

describe('light sync', () => {
  beforeEach(() => localStorage.clear());

  it('spreads 300 devices across the whole window instead of one burst', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const delays = Array.from({ length: 300 }, () => spreadDelay(8000, 300, rnd));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(300);
    expect(Math.max(...delays)).toBeLessThanOrEqual(8000);
    // Не більше ~1/6 пристроїв у будь-якій секунді.
    const perSecond = new Map<number, number>();
    delays.forEach((d) => perSecond.set(Math.floor(d / 1000), (perSecond.get(Math.floor(d / 1000)) ?? 0) + 1));
    expect(Math.max(...perSecond.values())).toBeLessThan(60);
  });

  it('waits longer on a slow link', () => {
    expect(signalWindowMs('ONLINE_SLOW')).toBeGreaterThan(signalWindowMs('ONLINE_FAST'));
  });

  it('keeps a cached copy and drops stale or broken ones', () => {
    writeCache('k', { a: 1 });
    expect(readCache<{ a: number }>('k')?.data).toEqual({ a: 1 });
    localStorage.setItem('old', JSON.stringify({ at: Date.now() - 10 * 86_400_000, data: 1 }));
    expect(readCache('old')).toBeNull();
    localStorage.setItem('bad', '{');
    expect(readCache('bad')).toBeNull();
  });
});
