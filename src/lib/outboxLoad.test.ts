import { describe, expect, it, vi } from 'vitest';

let calls = 0;
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: () => { calls++; return Promise.reject(new Error('Failed to fetch')); },
      }),
    }),
  },
}));

describe('outbox: поганий інтернет і велика черга', () => {
  it('при мертвій мережі не б’є по кожній дії, і нічого не губить', async () => {
    const { outbox } = await import('@/lib/outboxEngine');
    await outbox.ready;
    for (let i = 0; i < 50; i++) outbox.enqueue('PRESENCE', `child-${i}`, { isPresent: true });
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toBeLessThanOrEqual(6);
    expect(outbox.pending).toBe(50);
  });
});
