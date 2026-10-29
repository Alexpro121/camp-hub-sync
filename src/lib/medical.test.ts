import { describe, expect, it } from 'vitest';
import { MedicalDraftSchema, supervisorsForChild } from './medical';

describe('doctor supervisor lookup', () => {
  it('shows only active supervisors and ducklings from the child shift and team', () => {
    const result = supervisorsForChild([
      { shift_id: 's1', team_number: 4, staff_members: { full_name: 'Олена Коваль', kind: 'supervisor', is_active: true } },
      { shift_id: 's1', team_number: 4, staff_members: { full_name: 'Іра Каченя', kind: 'duckling', is_active: true } },
      { shift_id: 's1', team_number: 4, staff_members: { full_name: 'Лікар', kind: 'doctor', is_active: true } },
      { shift_id: 's2', team_number: 4, staff_members: { full_name: 'Інша зміна', kind: 'supervisor', is_active: true } },
    ], 's1', 4);
    expect(result).toEqual(['Олена Коваль', 'Іра Каченя']);
  });
});

it('medical edits cannot include a presence checkbox change', () => {
  const draft = MedicalDraftSchema.parse({ child_id: '11111111-1111-4111-8111-111111111111', note: 'Помітка лікаря', needs_attention: true, version: 0, is_present: true });
  expect(draft).not.toHaveProperty('is_present');
});

it('supports clearing the red medical attention mark', () => {
  const draft = MedicalDraftSchema.parse({ child_id: '11111111-1111-4111-8111-111111111111', note: '', needs_attention: false, version: 1 });
  expect(draft.needs_attention).toBe(false);
});