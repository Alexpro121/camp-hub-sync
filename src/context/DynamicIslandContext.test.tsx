import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DynamicIslandProvider, useDynamicIsland } from './DynamicIslandContext';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; }, removeChannel: vi.fn() } }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, pending: 0 }) }));
vi.mock('@/lib/networkEngine', () => ({ networkPulse: { subscribe: () => () => {} } }));
vi.mock('@/lib/outboxEngine', () => ({ outbox: { onFlushComplete: () => () => {}, pending: 0 } }));
vi.mock('@/lib/islandBus', () => ({ onIslandMessage: () => () => {} }));
vi.mock('@/hooks/useHaptics', () => ({ useHaptics: () => ({ impact: vi.fn(), notification: vi.fn() }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('island interaction lifecycle', () => {
  it('keeps an expanded notification visible until collapsed', () => {
    vi.useFakeTimers();
    const { result } = renderHook(useDynamicIsland, { wrapper: DynamicIslandProvider });
    act(() => result.current.showSuccess('Збережено', 'Довга нотатка'));
    act(() => result.current.toggleExpanded());
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.state).toBe('SUCCESS_TOAST');
    expect(result.current.expanded).toBe(true);
    act(() => result.current.toggleExpanded());
    act(() => vi.advanceTimersByTime(3200));
    expect(result.current.state).toBe('HIDDEN');
  });
  it('does not dismiss ongoing loading or import after 7.5 seconds', () => {
    vi.useFakeTimers();
    const { result } = renderHook(useDynamicIsland, { wrapper: DynamicIslandProvider });
    act(() => result.current.showLoader());
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.state).toBe('LOADING_ONLY');
    act(() => result.current.showExcelProgress(46, 'Діти.xlsx'));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.state).toBe('EXCEL_IMPORT');
    expect(result.current.payload.progress).toBe(46);
  });
});