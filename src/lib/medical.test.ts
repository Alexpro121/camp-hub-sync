import { describe, expect, it } from 'vitest';
import { supervisorsForChild } from './medical';

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