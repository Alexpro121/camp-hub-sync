import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminScheduleEditor from './AdminScheduleEditor';

const { calls, db } = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload?: any; filters: [string, string, unknown][] }[],
  db: { schedules: [] as any[], schedule_items: [] as any[] },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: 'schedules' | 'schedule_items') => {
    const filters: [string, string, unknown][] = [];
    let op = 'select'; let payload: any; let single = false;
    const run = () => {
      calls.push({ table, op, payload, filters: [...filters] });
      if (op === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r: any, i: number) => ({ id: `${table}-${db[table].length + i + 1}`, ...r }));
        db[table].push(...rows);
        return { data: single ? rows[0] : rows, error: null };
      }
      if (op === 'update' || op === 'delete') return { data: null, error: null };
      const rows = db[table].filter((r) => filters.every(([kind, k, v]) =>
        kind === 'eq' ? r[k] === v : kind === 'is' ? (r[k] ?? null) === v : kind === 'in' ? (v as unknown[]).includes(r[k]) : true));
      return { data: rows, error: null };
    };
    const chain: any = {
      select: () => chain, order: () => chain,
      eq: (k: string, v: unknown) => { filters.push(['eq', k, v]); return chain; },
      is: (k: string, v: unknown) => { filters.push(['is', k, v]); return chain; },
      in: (k: string, v: unknown) => { filters.push(['in', k, v]); return chain; },
      insert: (p: any) => { op = 'insert'; payload = p; return chain; },
      update: (p: any) => { op = 'update'; payload = p; return chain; },
      delete: () => { op = 'delete'; return chain; },
      single: () => { single = true; return chain; },
      then: (res: any) => Promise.resolve(run()).then(res),
    };
    return chain;
  };
  return { supabase: { from, rpc: vi.fn(), channel: vi.fn(() => ({ send: vi.fn(), subscribe: vi.fn() })), removeChannel: vi.fn() } };
});
vi.mock('@/lib/schedule', async (orig) => ({ ...(await orig<typeof import('@/lib/schedule')>()), broadcastScheduleUpdated: vi.fn() }));
vi.mock('@/hooks/useAutoTodayDate', () => ({ useAutoTodayDate: vi.fn(), localISO: () => '2026-11-20', kyivISO: () => '2026-11-20' }));
vi.mock('@/hooks/useAllTeams', () => ({ useAllTeams: () => ({ data: [1, 2, 6, 7], byShift: { A: [6, 7], B: [1, 2] }, loading: false, error: null }) }));
vi.mock('@/context/ActiveShiftContext', () => ({
  useActiveShift: () => ({
    shiftId: 'A',
    shifts: [
      { id: 'A', name: 'Листопад', start_date: '2026-11-20', end_date: '2026-12-02', deleted_at: null },
      { id: 'B', name: 'Зимова', start_date: '2026-11-20', end_date: '2026-11-25', deleted_at: null },
    ],
  }),
}));
vi.mock('./AdminAiStudioImportModal', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

beforeEach(() => { calls.length = 0; db.schedules = []; db.schedule_items = []; localStorage.clear(); });

describe('multi-shift schedule editor', () => {
  it('saves one shared event for both shifts on several days', async () => {
    render(<AdminScheduleEditor />);
    fireEvent.click(await screen.findByRole('button', { name: /Зимова/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Додати подію/ })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Сніданок'), { target: { value: 'Сніданок' } });
    fireEvent.change(within(dialog).getByLabelText('Початок'), { target: { value: '08:30' } });
    // Команди згруповані за змінами.
    expect(within(dialog).getByText('Листопад', { selector: 'span' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '1' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Сб 21\.11/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Зберегти на 2 дн/ }));

    await waitFor(() => expect(db.schedule_items).toHaveLength(2));
    expect(db.schedules).toHaveLength(2);
    for (const s of db.schedules) expect(s).toMatchObject({ shift_id: null, shift_ids: ['A', 'B'], is_published: true });
    expect(db.schedules.map((s) => s.date).sort()).toEqual(['2026-11-20', '2026-11-21']);
    expect(db.schedule_items[0]).toMatchObject({ title: 'Сніданок', time_start: '08:30', target_teams: [] });
  });

  it('drops teams of a shift that was removed from the event', async () => {
    localStorage.setItem('ironshift:schedule-scope', JSON.stringify(['A', 'B']));
    render(<AdminScheduleEditor />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Додати подію/ }))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Сніданок'), { target: { value: 'Квест' } });
    fireEvent.change(within(dialog).getByLabelText('Початок'), { target: { value: '10:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '1' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '6' }));
    fireEvent.click(within(within(dialog).getByText('Для змін').parentElement!).getByRole('button', { name: 'Зимова' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(db.schedule_items).toHaveLength(1));
    expect(db.schedules[0]).toMatchObject({ shift_id: 'A', shift_ids: ['A'] });
    expect(db.schedule_items[0].target_teams).toEqual([6]);
  });
});
