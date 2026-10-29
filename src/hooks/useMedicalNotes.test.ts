import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ data: [] as Array<{ child_id: string; note: string; version: number; needs_attention: boolean; updated_at: string }> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ abortSignal: () => Promise.resolve({ data: h.data, error: null }) }) }) } }));
import { useMedicalNotes } from './useMedicalNotes';
afterEach(() => { vi.useRealTimers(); });
describe('medical polling', () => {
  it('keeps identical snapshots stable and reflects changed and removed marks', async () => {
    h.data = [{ child_id: '1', note: 'Ліки', version: 1, needs_attention: true, updated_at: '2026-10-29' }];
    const { result, unmount } = renderHook(() => useMedicalNotes());
    await waitFor(() => expect(result.current['1']?.version).toBe(1));
    const first = result.current;
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(result.current).toBe(first);
    h.data = [{ ...h.data[0], version: 2, needs_attention: false }];
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(result.current['1'].needs_attention).toBe(false);
    h.data = [];
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(result.current).toEqual({});
    unmount();
  });
});