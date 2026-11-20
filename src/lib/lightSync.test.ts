import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStale, readCache, signalReload, signalWindowMs, spreadDelay, writeCache } from './lightSync';

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

describe('signal reload', () => {
  it('merges a burst of registry check-ins into one download', () => {
    vi.useFakeTimers();
    const load = vi.fn();
    const reload = signalReload(load, () => 4000);
    for (let i = 0; i < 50; i++) reload.trigger();
    vi.advanceTimersByTime(4000);
    expect(load).toHaveBeenCalledTimes(1);
    reload.trigger();
    reload.cancel();
    vi.advanceTimersByTime(4000);
    expect(load).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not refetch the whole roster on every phone unlock', () => {
    const now = 1_000_000;
    expect(isStale(now - 30_000, 90_000, now)).toBe(false);
    expect(isStale(now - 120_000, 90_000, now)).toBe(true);
    expect(isStale(0, 90_000, now)).toBe(true);
  });
});
