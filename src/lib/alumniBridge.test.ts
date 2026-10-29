import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ query: null as any, row: null as any, channel: null as any }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => mock.query, channel: () => mock.channel, removeChannel: vi.fn(),
} }));
import { hostPassportBridge, subscribeAlumniBroadcast } from './alumniBridge';
import { buildAlumniPassport } from './alumniPassport';
beforeEach(() => {
  localStorage.clear();
  mock.row = { id: 'newest', kind: 'alumni_announcement', title: 'News', target_year: 2026, created_at: '2026-10-01T10:00:00Z' };
  mock.query = { select: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), limit: vi.fn(() => Promise.resolve({ data: [mock.row] })) };
  mock.channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() };
});
it('uses a six-digit temporary transfer code, not the passport UUID', () => {
  const handle = hostPassportBridge(buildAlumniPassport({ full_name: 'Марія Коваль', team_number: 3, iron_dollars: 247 }));
  expect(handle.pin).toMatch(/^\d{6}$/); handle.close();
});
it('keeps read state separate for two passports and requests newest matching broadcast', async () => {
  const first = vi.fn(); const second = vi.fn();
  const stop1 = subscribeAlumniBroadcast(first, { passportId: 'p1', year: 2026 });
  await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1)); stop1();
  const stop2 = subscribeAlumniBroadcast(second, { passportId: 'p2', year: 2026 });
  await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1)); stop2();
  expect(mock.query.order).toHaveBeenCalledWith('created_at', { ascending: false });
  expect(mock.query.or).toHaveBeenCalledWith('target_year.is.null,target_year.eq.2026');
});