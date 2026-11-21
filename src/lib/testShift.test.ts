import { describe, expect, it } from 'vitest';
import { takePickParam, testClosesLabel, testShiftOpen } from './testShift';

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

  it('takes the team-pick link from the URL once', () => {
    const token = 'AbCdEf0123456789_test';
    window.history.replaceState(null, '', `/staff?pick=${token}`);
    expect(takePickParam()).toBe(token);
    expect(window.location.search).toBe('');
    expect(takePickParam()).toBeNull();
  });
});
