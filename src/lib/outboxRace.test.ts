import { describe, expect, it, vi } from 'vitest';

let release: (() => void) | null = null;
const updates: boolean[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (v: { is_present: boolean }) => ({
        eq: () =>
          new Promise((resolve) => {
            updates.push(v.is_present);
            if (updates.length === 1) release = () => resolve({ error: null });
            else resolve({ error: null });
          }),
      }),
    }),
  },
}));

describe('outbox: зміна під час польоту запиту', () => {
  it('не губить новішу відмітку, що склеїлась з уже відправленою', async () => {
    const { outbox } = await import('@/lib/outboxEngine');
    await outbox.ready;

    outbox.enqueue('PRESENCE', 'child-1', { isPresent: true });
    await vi.waitFor(() => expect(release).not.toBeNull());

    // Поки перший запит «летить», відмітку змінили на протилежну
    outbox.enqueue('PRESENCE', 'child-1', { isPresent: false });
    release!();

    await vi.waitFor(() => expect(updates).toEqual([true, false]), { timeout: 5000 });
    await vi.waitFor(() => expect(outbox.pending).toBe(0), { timeout: 5000 });
  });
});
