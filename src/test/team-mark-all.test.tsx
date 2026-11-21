/** Перекличка одним дотиком: «Усі присутні / Усі відсутні» міняють лише свою команду й скасовуються з тосту. */
import 'fake-indexeddb/auto';
import { act, render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const updates: { table: string; payload: any; id?: string }[] = [];
  const tables: Record<string, any> = {};
  const builder = (table: string): any => {
    const b: any = {};
    let last: { table: string; payload: any; id?: string } | null = null;
    ['select', 'in', 'order', 'limit', 'is', 'gt', 'neq', 'filter', 'abortSignal', 'range', 'single', 'upsert', 'insert', 'delete', 'match'].forEach((m) => { b[m] = () => b; });
    b.update = (payload: any) => { last = { table, payload }; updates.push(last); return b; };
    b.eq = (col: string, val: string) => { if (last && col === 'id') last.id = val; return b; };
    b.maybeSingle = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
    b.then = (res: any, rej?: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej);
    return b;
  };
  return { updates, tables, builder, toast: vi.fn() };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => h.builder(t),
    channel: () => { const ch: any = { on: () => ch, subscribe: () => 'SUBSCRIBED' }; return ch; },
    removeChannel: vi.fn(),
    auth: { getUser: async () => ({ data: { user: { id: 'sup-1' } } }) },
    rpc: async () => ({ data: null, error: null }),
  },
}));
vi.mock('@/context/DynamicIslandContext', () => ({
  useDynamicIsland: () => ({ showError: vi.fn(), show: vi.fn(), hide: vi.fn(), showSuccess: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: h.toast, error: vi.fn() }) }));

import TeamsView from '@/components/supervisor/TeamsView';

const SHIFT_ID = '22222222-2222-4222-8222-222222222222';
const kid = (id: string, row: number, team: number, present: boolean) => ({
  id, shift_id: SHIFT_ID, row_number: row, team_number: team, full_name: `Дитина ${row}`, gender: 'girl', phone: null,
  team_name: null, note_from_table: null, is_present: present, has_logged_in: false, iron_dollars: 0, telegram_username: null,
  supervisor_notes: null, notes_origin: null, raw_data: null, created_at: '2026-11-21T08:00:00.000Z', updated_at: '2026-11-21T08:00:00.000Z',
});
const A = '11111111-1111-4111-8111-11111111111a';
const B = '11111111-1111-4111-8111-11111111111b';
const OTHER = '11111111-1111-4111-8111-11111111111c';

beforeEach(() => {
  h.updates.length = 0;
  h.toast.mockReset();
  localStorage.clear();
  h.tables.shifts = [{ id: SHIFT_ID, name: 'WOW', shift_type: 'long', start_date: '2026-11-21', end_date: '2026-11-21', is_active: true, team_offset: 0, deleted_at: null }];
  h.tables.children = [kid(A, 1, 4, true), kid(B, 2, 4, false), kid(OTHER, 3, 5, false)];
});
afterEach(cleanup);

const presence = (id: string) => h.updates.filter((u) => u.table === 'children' && u.id === id && 'is_present' in u.payload).map((u) => u.payload.is_present);

describe('позначити всю команду', () => {
  it('ставить присутніми лише дітей своєї команди, яких ще не відмітили, і дає скасувати', async () => {
    render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);
    const all = await screen.findByRole('button', { name: /Усі присутні/ });
    fireEvent.click(all);

    await waitFor(() => expect(presence(B)).toEqual([true]));
    expect(presence(A)).toEqual([]);
    expect(presence(OTHER)).toEqual([]);
    expect((screen.getByRole('button', { name: /Усі присутні/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(h.toast).toHaveBeenCalledWith('Присутні: позначено 1', expect.anything());

    act(() => h.toast.mock.calls[0][1].action.onClick());
    await waitFor(() => expect(presence(B)).toEqual([true, false]));
  });

  it('«Усі відсутні» знімає присутність у своїй команді', async () => {
    render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /Усі відсутні/ }));
    await waitFor(() => expect(presence(A)).toEqual([false]));
    expect(presence(B)).toEqual([]);
    expect((screen.getByRole('button', { name: /Усі відсутні/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
