import { describe, expect, it } from 'vitest';
import { takeEnterParam, testClosesLabel, testShiftOpen } from './testShift';

describe('test shift', () => {
  it('shows the closing time in Kyiv time', () => {
    expect(testClosesLabel('2026-11-21T21:59:00Z')).toBe('21.11 о 23:59');
  });

  it('is open only until expires_at', () => {
    const at = '2026-11-21T21:59:00Z';
    expect(testShiftOpen(at, Date.parse(at) - 1)).toBe(true);
    expect(testShiftOpen(at, Date.parse(at))).toBe(false);
    expect(testShiftOpen(null)).toBe(false);
  });

  it('takes the invite assignment from the URL once', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    window.history.replaceState(null, '', `/staff?enter=${id}`);
    expect(takeEnterParam()).toBe(id);
    expect(window.location.search).toBe('');
    expect(takeEnterParam()).toBeNull();
  });
});
