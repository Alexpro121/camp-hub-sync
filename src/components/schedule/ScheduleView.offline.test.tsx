import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ScheduleView from './ScheduleView';

const { state } = vi.hoisted(() => ({ state: { fail: true, calls: [] as string[], filters: [] as [string, unknown][] } }));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    state.calls.push(table);
    const chain: any = {
      select: () => chain, eq: () => chain, is: () => chain, in: () => chain, order: () => chain,
      gte: (k: string, v: unknown) => { state.filters.push([k, v]); return chain; },
      then: (res: any) => Promise.resolve(state.fail ? { data: null, error: new Error('network') } : { data: [], error: null }).then(res),
    };
    return chain;
  };
  const channel = () => { const c: any = { on: () => c, subscribe: () => c }; return c; };
  return { supabase: { from, channel, removeChannel: vi.fn(), auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } };
});
vi.mock('@/lib/session', () => ({ getSessionMeta: () => ({ shiftId: 'S' }) }));
vi.mock('@/hooks/useAllTeams', () => ({ useAllTeams: () => ({ data: [7], byShift: {}, loading: false, error: null }) }));
vi.mock('@/hooks/useAutoTodayDate', () => ({ kyivISO: () => '2026-11-20', localISO: () => '2026-11-20', useAutoTodayDate: vi.fn() }));
vi.mock('@/hooks/useHaptics', () => ({ useHaptics: () => ({ impact: vi.fn(), selection: vi.fn(), notification: vi.fn() }) }));

const cacheKey = 'ironshift:schedule:S:team';

beforeEach(() => {
  localStorage.clear();
  state.fail = true; state.calls = []; state.filters = [];
  localStorage.setItem(cacheKey, JSON.stringify({
    at: Date.now(),
    data: {
      schedules: [{ id: 'sch', date: '2026-11-20', shift_id: 'S', shift_ids: ['S'], is_published: true }],
      items: [{ id: 'i1', schedule_id: 'sch', title: 'Сніданок у вагоні', time_start: '08:30', time_end: '09:00', target_teams: [], order_index: 0, description: null }],
    },
  }));
});

describe('schedule in a train with a weak link', () => {
  it('opens from the saved copy and keeps it when the network fails', async () => {
    render(<ScheduleView myTeam={7} lockTeam />);
    expect(await screen.findByText('Сніданок у вагоні')).toBeTruthy();
    await waitFor(() => expect(state.calls).toContain('schedules'));
    // Запит упав — збережений розклад лишився на екрані.
    expect(screen.getByText('Сніданок у вагоні')).toBeTruthy();
  });

  it('asks only for today and yesterday, not the whole shift', async () => {
    render(<ScheduleView myTeam={7} lockTeam />);
    await waitFor(() => expect(state.filters).toContainEqual(['date', '2026-11-19']));
  });
});
