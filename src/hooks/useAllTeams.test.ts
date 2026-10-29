import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const from = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
import { useAllTeams } from './useAllTeams';
beforeEach(() => { from.mockReset(); from.mockReturnValue({ select: () => Promise.resolve({ data: [], error: null }) }); });
describe('conditional team discovery', () => {
  it('does not request teams for a locked child schedule', () => {
    const { result } = renderHook(() => useAllTeams(false));
    expect(from).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
  it('loads teams when the selector is enabled', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useAllTeams(enabled), { initialProps: { enabled: false } });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(from).toHaveBeenCalledTimes(2);
  });
});