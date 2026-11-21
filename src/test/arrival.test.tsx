/**
 * «На зміні»: відмітка з реєстрації окремо від переклички. Біля імені ✓ (на зміні) або ● (в акаунті),
 * сортування за прибуттям і маленька кнопка в профілі з підтвердженням (відмітку бачить стійка).
 */
import 'fake-indexeddb/auto';
import { act, render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
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
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));
vi.mock('@/context/DynamicIslandContext', () => ({
  useDynamicIsland: () => ({ showError: vi.fn(), show: vi.fn(), hide: vi.fn(), showSuccess: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: h.toast, error: vi.fn(), warning: vi.fn() }) }));

import TeamsView from '@/components/supervisor/TeamsView';

const SHIFT_ID = '22222222-2222-4222-8222-222222222222';
const kid = (id: string, row: number, over: Record<string, any> = {}) => ({
  id, shift_id: SHIFT_ID, row_number: row, team_number: 4, full_name: `Дитина ${row}`, gender: 'girl', phone: null,
  team_name: null, note_from_table: null, is_present: false, checked_in: false, checked_in_at: null, has_logged_in: false,
  iron_dollars: 0, telegram_username: null, supervisor_notes: null, notes_origin: null, raw_data: null,
  created_at: '2026-11-21T08:00:00.000Z', updated_at: '2026-11-21T08:00:00.000Z', ...over,
});
const A = '11111111-1111-4111-8111-11111111111a'; // не прибула
const B = '11111111-1111-4111-8111-11111111111b'; // на зміні
const C = '11111111-1111-4111-8111-11111111111c'; // на зміні й увійшла в акаунт

Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, scrollIntoView: () => {} });

beforeEach(() => {
  h.updates.length = 0;
  h.toast.mockReset();
  localStorage.clear();
  h.tables.shifts = [{ id: SHIFT_ID, name: 'WOW', shift_type: 'long', start_date: '2026-11-21', end_date: '2026-11-21', is_active: true, team_offset: 0, deleted_at: null }];
  h.tables.children = [
    kid(A, 1),
    kid(B, 2, { checked_in: true, checked_in_at: '2026-11-21T08:42:00.000Z', checked_in_by: 'registry' }),
    kid(C, 3, { checked_in: true, checked_in_at: '2026-11-21T08:30:00.000Z', has_logged_in: true }),
  ];
});
afterEach(cleanup);

const card = (n: number) => screen.findByRole('button', { name: `Відкрити картку: Дитина ${n}` });
const arrival = (id: string) => h.updates.filter((u) => u.table === 'children' && u.id === id && 'checked_in' in u.payload).map((u) => u.payload.checked_in);

describe('на зміні', () => {
  it('біля імені: ✓ — на зміні, ● — увійшла в акаунт замість ✓, нічого — ще не прибула', async () => {
    render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);
    expect(within(await card(1)).queryByRole('img', { name: /На зміні|акаунт/ })).toBeNull();
    expect(within(await card(2)).getByRole('img', { name: 'На зміні' })).toBeInTheDocument();
    const loggedIn = await card(3);
    expect(within(loggedIn).getByRole('img', { name: 'Увійшов(ла) в акаунт' })).toBeInTheDocument();
    expect(within(loggedIn).queryByRole('img', { name: 'На зміні' })).toBeNull();
    // Основний квадрат — перекличка, окремо від прибуття.
    expect(within(await card(2)).getByRole('checkbox', { name: 'Позначити присутнім' })).toBeInTheDocument();
    expect(screen.getByText(/3 дітей · 2 на зміні · 0 присутні · 1 увійшли/)).toBeInTheDocument();
  });

  it('сортує «Спочатку ще не прибули» і «Спочатку на зміні»', async () => {
    render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);
    await card(1);
    const order = () => screen.getAllByRole('button', { name: /Відкрити картку/ }).map((b) => b.getAttribute('aria-label'));
    const pick = async (name: string) => {
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
      fireEvent.keyDown(await screen.findByRole('option', { name }), { key: 'Enter' });
    };
    await pick('Спочатку на зміні');
    await waitFor(() => expect(order()[2]).toBe('Відкрити картку: Дитина 1'));
    await pick('Спочатку ще не прибули');
    await waitFor(() => expect(order()[0]).toBe('Відкрити картку: Дитина 1'));
  });

  it('у профілі кнопка питає підтвердження, бо відмітку бачить стійка реєстрації', async () => {
    render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);
    fireEvent.click(await card(1));
    expect(await screen.findByTestId('arrival-status')).toHaveTextContent('Ще не на зміні');

    // Скасувати у вікні — нічого не змінюється.
    fireEvent.click(screen.getByRole('button', { name: 'Позначити на зміні' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Стійка реєстрації/);
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(arrival(A)).toEqual([]);

    // Підтвердили — на зміні, з позначкою «супровід».
    fireEvent.click(screen.getByRole('button', { name: 'Позначити на зміні' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Так, позначити' }));
    await waitFor(() => expect(arrival(A)).toEqual([true]));
    expect(screen.getByTestId('arrival-status')).toHaveTextContent(/На зміні · о \d\d:\d\d · супровід/);
    expect(h.updates.some((u) => u.id === A && 'is_present' in u.payload)).toBe(false);

    // Зняти — теж через підтвердження.
    fireEvent.click(screen.getByRole('button', { name: 'Зняти' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Так, зняти' }));
    await waitFor(() => expect(arrival(A)).toEqual([true, false]));
    expect(screen.getByTestId('arrival-status')).toHaveTextContent('Ще не на зміні');
  });

  it('показує, що відмітила реєстрація', async () => {
    render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);
    fireEvent.click(await card(2));
    expect(await screen.findByTestId('arrival-status')).toHaveTextContent(/На зміні · .*о \d\d:\d\d · реєстрація/);
  });

  it('показує час відмітки з реєстрації і стан «в акаунті»', async () => {
    render(<TeamsView myTeam={4} shiftId={SHIFT_ID} />);
    fireEvent.click(await card(3));
    expect(await screen.findByTestId('arrival-status')).toHaveTextContent('На зміні');
    expect(screen.getByText('В акаунті')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зняти' })).toBeInTheDocument();
  });
});
