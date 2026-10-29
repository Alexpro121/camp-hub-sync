import { describe, expect, it } from 'vitest';
import { mergeRegistryRows, patchRegistryRows, persistRegistryPatches, readRegistryScope } from './registrySync';

describe('registry acknowledged baseline', () => {
  it('keeps acknowledged presence and notes when the queue is cleared', () => {
    expect(mergeRegistryRows([{ id: '1', is_present: false, supervisor_notes: '' }], [
      { id: '1', is_present: true, supervisor_notes: 'Здали ліки' },
    ])).toEqual([{ id: '1', is_present: true, supervisor_notes: 'Здали ліки' }]);
  });
  it('reconciles added and removed rows', () => {
    expect(mergeRegistryRows([{ id: '1' }, { id: '2' }], [{ id: '1', deleted_at: '2026-10-29' }, { id: '3' }])).toEqual([{ id: '2' }, { id: '3' }]);
  });
  it('does not insert partial acknowledgements from another shift', () => {
    expect(patchRegistryRows([{ id: 'A', is_present: false }], [{ id: 'B', is_present: true }])).toEqual([{ id: 'A', is_present: false }]);
  });
  it('preserves newer acknowledged fields over a stale full list', () => {
    expect(patchRegistryRows([{ id: 'A', is_present: false, updated_at: '2026-10-29T13:00:00Z' }], [{ id: 'A', is_present: true, updated_at: '2026-10-29T13:01:00Z' }])[0].is_present).toBe(true);
    expect(patchRegistryRows([{ id: 'A', is_present: true, updated_at: '2026-10-29T13:02:00Z' }], [{ id: 'A', is_present: false, updated_at: '2026-10-29T13:01:00Z' }])[0].is_present).toBe(true);
  });
  it('updates all cached scopes without adding unknown children', () => {
    localStorage.clear();
    for (const scope of ['all', 'A']) localStorage.setItem(`ironshift:registry-list:${scope}`, JSON.stringify({ at: 123, children: [{ id: 'A', is_present: false }] }));
    persistRegistryPatches<{ id: string; is_present: boolean }>(localStorage, [{ id: 'A', is_present: true }, { id: 'B', is_present: true }]);
    for (const scope of ['all', 'A']) expect(JSON.parse(localStorage.getItem(`ironshift:registry-list:${scope}`) ?? '{}').children).toEqual([{ id: 'A', is_present: true }]);
  });
  it('distinguishes offline all-shifts selection from a missing choice', () => {
    localStorage.clear();
    expect(readRegistryScope(localStorage)).toBeUndefined();
    localStorage.setItem('ironshift:registry-scope', 'all');
    expect(readRegistryScope(localStorage)).toBeNull();
    localStorage.setItem('ironshift:registry-scope', '22222222-2222-4222-8222-222222222222');
    expect(readRegistryScope(localStorage)).toBe('22222222-2222-4222-8222-222222222222');
  });
});