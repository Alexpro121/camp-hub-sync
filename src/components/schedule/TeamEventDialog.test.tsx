import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeamEventDialog from './TeamEventDialog';

const { db } = vi.hoisted(() => ({ db: { schedules: [] as any[], schedule_items: [] as any[], updates: [] as any[] } }));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: 'schedules' | 'schedule_items') => {
    const filters: [string, unknown][] = [];
    let op = 'select'; let payload: any; let single = false;
    const run = () => {
      if (op === 'insert') {
        const row = { id: `${table}-${db[table].length + 1}`, ...payload };
        db[table].push(row);
        return { data: single ? row : [row], error: null };
      }
      if (op === 'update') { db.updates.push({ table, payload, filters }); return { data: null, error: null }; }
      return { data: db[table].filter((r) => filters.every(([k, v]) => (Array.isArray(v) && k === 'schedule_id' ? v.includes(r[k]) : (r[k] ?? null) === v))), error: null };
    };
    const chain: any = {
      select: () => chain,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
      is: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
      in: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
      insert: (p: any) => { op = 'insert'; payload = p; return chain; },
      update: (p: any) => { op = 'update'; payload = p; return chain; },
      delete: () => { op = 'delete'; return chain; },
      single: () => { single = true; return chain; },
      then: (res: any) => Promise.resolve(run()).then(res),
    };
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/lib/schedule', async (orig) => ({ ...(await orig<typeof import('@/lib/schedule')>()), broadcastScheduleUpdated: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => { db.schedules = []; db.schedule_items = []; db.updates = []; });

describe('supervisor team events', () => {
  it('adds an event only for the own team into the published schedule of the shift', async () => {
    db.schedules.push({ id: 'draft', date: '2026-11-21', shift_id: 'S', shift_ids: ['S'], is_published: false, deleted_at: null });
    const onSaved = vi.fn();
    render(<TeamEventDialog open onOpenChange={vi.fn()} team={7} shiftId="S" date="2026-11-21" onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('Збір команди'), { target: { value: 'Збір команди' } });
    fireEvent.change(screen.getByPlaceholderText('18:00'), { target: { value: '18.30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('2026-11-21'));
    // Чернетку адміністратора не чіпаємо — створено окремий опублікований розклад зміни.
    const created = db.schedules.find((s) => s.id !== 'draft');
    expect(created).toMatchObject({ shift_id: 'S', shift_ids: ['S'], is_published: true, date: '2026-11-21' });
    expect(db.schedule_items[0]).toMatchObject({ schedule_id: created.id, title: 'Збір команди', time_start: '18:30', target_teams: [7] });
  });

  it('warns about an overlap and saves only after confirmation', async () => {
    db.schedules.push({ id: 'pub', date: '2026-11-21', shift_id: 'S', shift_ids: ['S'], is_published: true, deleted_at: null });
    db.schedule_items.push({ id: 'lunch', schedule_id: 'pub', title: 'Обід', time_start: '13:00', time_end: '14:00', target_teams: [], has_sub_slots: false, sub_slots: [] });
    const onSaved = vi.fn();
    render(<TeamEventDialog open onOpenChange={vi.fn()} team={7} shiftId="S" date="2026-11-21" onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('Збір команди'), { target: { value: 'Збір' } });
    fireEvent.change(screen.getByPlaceholderText('18:00'), { target: { value: '13:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Обід');
    expect(db.schedule_items).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Все одно зберегти' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.schedule_items[1]).toMatchObject({ schedule_id: 'pub', title: 'Збір', target_teams: [7] });
  });

  it('edits an own event without changing its team', async () => {
    const item = { id: 'mine', schedule_id: 'p', title: 'Старт', time_start: '10:00', time_end: '11:00', description: null, target_teams: [7], order_index: 0 };
    render(<TeamEventDialog open onOpenChange={vi.fn()} team={7} shiftId="S" date="2026-11-21" item={item as any} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('Старт'), { target: { value: 'Старт квесту' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(db.updates).toHaveLength(1));
    expect(db.updates[0].payload).toMatchObject({ title: 'Старт квесту', target_teams: [7] });
    expect(db.updates[0].filters).toContainEqual(['id', 'mine']);
  });
});
