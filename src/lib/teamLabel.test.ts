import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ is: async () => ({ data: [] }) }) }) } }));
import { isSportsShift, rememberShiftKinds, teamLabel, teamLabelFor } from '@/lib/teamLabel';
import { saveSession } from '@/lib/session';

describe('підпис команди спортивної зміни', () => {
  it('«1-СПОРТ» для спортивної, номер — для звичайної', () => {
    expect(teamLabel(1, true)).toBe('1-СПОРТ');
    expect(teamLabel(1, false)).toBe('1');
    expect(teamLabel(null, true)).toBe('');
  });

  it('спортивна — за категорією або типом зміни', () => {
    expect(isSportsShift({ shift_type: 'short', shift_category: 'sports' })).toBe(true);
    expect(isSportsShift({ shift_type: 'sports', shift_category: null })).toBe(true);
    expect(isSportsShift({ shift_type: 'short', shift_category: 'short' })).toBe(false);
  });

  it('пам\'ятає спортивні зміни й бере зміну сесії супроводу за замовчуванням', () => {
    rememberShiftKinds([{ id: 'sport', shift_type: 'short', shift_category: 'sports' }, { id: 'short', shift_type: 'short', shift_category: 'short' }]);
    expect(teamLabelFor(3, 'sport')).toBe('3-СПОРТ');
    expect(teamLabelFor(3, 'short')).toBe('3');
    expect(JSON.parse(localStorage.getItem('helpsuprov:sports-shifts')!)).toEqual(['sport']);
    saveSession('supervisor', { teamNumber: 3, shiftId: 'sport' });
    expect(teamLabelFor(3)).toBe('3-СПОРТ');
    // Зміну перевели у звичайну — підпис зникає.
    rememberShiftKinds([{ id: 'sport', shift_type: 'short', shift_category: 'short' }]);
    expect(teamLabelFor(3)).toBe('3');
  });
});
