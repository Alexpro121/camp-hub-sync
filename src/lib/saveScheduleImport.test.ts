import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveScheduleImport } from './saveScheduleImport';
import { previewScheduleImport } from './scheduleImport';

const { calls, responses, from } = vi.hoisted(() => {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const responses: { data?: unknown; error?: unknown }[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'in', 'order', 'range', 'insert', 'single', 'delete']) {
      chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
    }
    chain.then = (resolve: (value: unknown) => void) => resolve(responses.shift() ?? { data: [], error: null });
    return chain;
  });
  return { calls, responses, from };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
const days = previewScheduleImport('[{"date":"2026-10-29","items":[{"title":"Гра","time_start":"10:00"}]}]', '2026-10-29').days;
beforeEach(() => { calls.length = 0; responses.length = 0; from.mockClear(); });

describe('isolated schedule draft writes', () => {
  it('never reuses an existing published batch', async () => {
    responses.push({ data: [{ id: 'published', shift_id: 'shift-a', shift_ids: null }] }, { data: [] }, { data: { id: 'new-draft' } }, {});
    expect(await saveScheduleImport(days, ['shift-a'], '')).toEqual({ total: 1, skipped: 0 });
    expect(calls).toContainEqual({ table: 'schedule_items', method: 'in', args: ['schedule_id', ['published']] });
    const insertedBatch = calls.filter((call) => call.table === 'schedules' && call.method === 'insert');
    expect(insertedBatch[0].args[0]).toMatchObject({ is_published: false, shift_id: 'shift-a', shift_ids: ['shift-a'] });
    const rows = calls.find((call) => call.table === 'schedule_items' && call.method === 'insert')?.args[0];
    expect(rows).toEqual([expect.objectContaining({ schedule_id: 'new-draft' })]);
  });
  it('aborts before writing when duplicate lookup fails', async () => {
    responses.push({ data: [{ id: 'existing', shift_id: 'shift-a' }] }, { error: new Error('read failed') });
    await expect(saveScheduleImport(days, ['shift-a'], '')).rejects.toThrow('read failed');
    expect(calls.filter((call) => call.method === 'insert')).toHaveLength(0);
  });
  it('skips same-shift re-imports without creating empty drafts', async () => {
    responses.push({ data: [{ id: 'existing', shift_id: 'shift-a' }] }, { data: [{ title: 'Гра', time_start: '10:00:00', location: null, target_teams: [] }] });
    expect(await saveScheduleImport(days, ['shift-a'], '')).toEqual({ total: 0, skipped: 1 });
    expect(calls.filter((call) => call.method === 'insert')).toHaveLength(0);
  });
  it('removes all newly-created batches if a later day fails', async () => {
    responses.push({ data: [] }, { data: { id: 'draft-one' } }, {}, { data: [] }, { data: { id: 'draft-two' } }, { error: new Error('write failed') }, {}, {});
    await expect(saveScheduleImport([...days, { ...days[0], date: '2026-10-30' }], ['shift-a'], '')).rejects.toThrow('write failed');
    expect(calls).toContainEqual({ table: 'schedule_items', method: 'in', args: ['schedule_id', ['draft-one', 'draft-two']] });
    expect(calls).toContainEqual({ table: 'schedules', method: 'in', args: ['id', ['draft-one', 'draft-two']] });
  });
  it('reports failed cleanup instead of claiming full rollback', async () => {
    responses.push({ data: [] }, { data: { id: 'draft' } }, { error: new Error('write failed') }, { error: new Error('offline') });
    await expect(saveScheduleImport(days, [], '')).rejects.toThrow('частина чернетки залишилася');
    const insertedBatch = calls.find((call) => call.table === 'schedules' && call.method === 'insert');
    expect(insertedBatch?.args[0]).toMatchObject({ shift_id: null, shift_ids: null });
  });
  it('writes one shared batch for several shifts and ignores other audiences', async () => {
    responses.push({ data: [{ id: 'only-a', shift_id: 'shift-a', shift_ids: ['shift-a'] }] }, { data: { id: 'shared' } }, {});
    expect(await saveScheduleImport(days, ['shift-b', 'shift-a'], '')).toEqual({ total: 1, skipped: 0 });
    expect(calls.some((call) => call.table === 'schedule_items' && call.method === 'in')).toBe(false);
    const insertedBatch = calls.find((call) => call.table === 'schedules' && call.method === 'insert');
    expect(insertedBatch?.args[0]).toMatchObject({ shift_id: null, shift_ids: ['shift-a', 'shift-b'] });
  });
});