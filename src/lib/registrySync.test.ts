import { describe, expect, it } from 'vitest';
import { mergeRegistryRows } from './registrySync';

describe('registry acknowledged baseline', () => {
  it('keeps acknowledged presence and notes when the queue is cleared', () => {
    expect(mergeRegistryRows([{ id: '1', is_present: false, supervisor_notes: '' }], [
      { id: '1', is_present: true, supervisor_notes: 'Здали ліки' },
    ])).toEqual([{ id: '1', is_present: true, supervisor_notes: 'Здали ліки' }]);
  });
  it('reconciles added and removed rows', () => {
    expect(mergeRegistryRows([{ id: '1' }, { id: '2' }], [{ id: '1', deleted_at: '2026-10-29' }, { id: '3' }])).toEqual([{ id: '2' }, { id: '3' }]);
  });
});