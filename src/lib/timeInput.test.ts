import { describe, expect, it } from 'vitest';
import { maskTimeInput, normalizeTime } from './scheduleCategories';

describe('phone time entry', () => {
  it('reads digit-only times from a numeric keypad', () => {
    expect(normalizeTime('930')).toBe('09:30');
    expect(normalizeTime('1830')).toBe('18:30');
    expect(normalizeTime('18,30')).toBe('18:30');
    expect(normalizeTime('9')).toBe('09:00');
    expect(normalizeTime('2460')).toBeNull();
  });

  it('inserts the colon at four digits and keeps partial input stable', () => {
    const typed = ['1', '18', '183', '1830'].map(maskTimeInput);
    expect(typed).toEqual(['1', '18', '183', '18:30']);
    expect(maskTimeInput('18:3')).toBe('18:3');
    expect(maskTimeInput('18:300'.slice(0, 5))).toBe('18:30');
    expect(maskTimeInput('14.25 - 14.56')).toBe('14.25 - 14.56');
  });
});
