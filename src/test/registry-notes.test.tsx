/**
 * Нотатка з реєстрації: супровід своєї команди бачить її в списку,
 * читає й редагує індивідуально; після його правки нотатка перестає
 * бути «з реєстрації».
 */
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const updates: { table: string; payload: any }[] = [];
  const tables: Record<string, any> = {};
  const builder = (table: string): any => {
    const b: any = {};
    const chain = ['select', 'eq', 'in', 'order', 'limit', 'is', 'gt', 'neq', 'filter', 'abortSignal', 'range', 'single', 'upsert', 'insert', 'update', 'delete', 'match'];
    chain.forEach((m) => {
      b[m] = (...args: any[]) => {
        if (m === 'update') updates.push({ table, payload: args[0] });
        return b;
      };
    });
    b.maybeSingle = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
    b.then = (res: any, rej?: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej);
    return b;
  };
  return { updates, tables, builder };
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

import TeamsView from '@/components/supervisor/TeamsView';

const CHILD_ID = '11111111-1111-4111-8111-111111111111';
const SHIFT_ID = '22222222-2222-4222-8222-222222222222';

const child = (over: Record<string, any> = {}) => ({
  id: CHILD_ID,
  shift_id: SHIFT_ID,
  row_number: 1,
  team_number: 4,
  full_name: 'Коваль Олена',
  gender: 'girl',
  phone: '+380671112233',
  team_name: null,
  note_from_table: null,
  is_present: true,
  has_logged_in: false,
  iron_dollars: 10,
  telegram_username: null,
  supervisor_notes: 'Здали ліки',
  notes_origin: 'registry',
  raw_data: null,
  created_at: '2026-10-28T08:00:00.000Z',
  updated_at: '2026-10-29T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  h.updates.length = 0;
  h.tables.shifts = [{ id: SHIFT_ID, name: 'WOW', shift_type: 'long', start_date: '2026-10-29', end_date: '2026-10-31', is_active: true, team_offset: 0, deleted_at: null }];
  h.tables.children = [child()];
});

afterEach(cleanup);

const open = () => render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);

describe('нотатка з реєстрації у супроводу', () => {
  it('показує текст нотатки з реєстрації прямо в списку команди', async () => {
    open();
    expect(await screen.findByText('Реєстрація:')).toBeInTheDocument();
    expect(screen.getByText('Здали ліки')).toBeInTheDocument();
  });

  it('відкриває нотатку в картці дитини й зберігає правку супроводу як свою', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Відкрити картку: Коваль Олена' }));
    expect(await screen.findByText('з реєстрації')).toBeInTheDocument();
    const box = screen.getByLabelText(/Замітки/);
    expect(box).toHaveValue('Здали ліки');
    fireEvent.change(box, { target: { value: 'Здали ліки — перевірено' } });
    await waitFor(
      () => expect(h.updates.some((u) => u.table === 'children'
        && u.payload.supervisor_notes === 'Здали ліки — перевірено'
        && u.payload.notes_origin === 'staff')).toBe(true),
      { timeout: 4000 },
    );
  });

  it('не чіпає нотатку, якщо супровід відкрив картку нічого в ній не міняв', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Відкрити картку: Коваль Олена' }));
    await screen.findByText('з реєстрації');
    await waitFor(() => expect(h.updates.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(h.updates.every((u) => !('supervisor_notes' in u.payload))).toBe(true);
  });

  it('нотатку супроводу показує без позначки реєстрації', async () => {
    h.tables.children = [child({ notes_origin: 'staff' })];
    open();
    expect(await screen.findByText('Нотатка:')).toBeInTheDocument();
    expect(screen.queryByText('з реєстрації')).not.toBeInTheDocument();
  });
});
