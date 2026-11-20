import { describe, expect, it } from 'vitest';
import { audienceOf, audiencePayload, sameAudience, touchesShifts, visibleToShift } from './scheduleAudience';

describe('schedule audience', () => {
  const shared = { shift_id: null, shift_ids: ['b', 'a', 'a'] };
  const single = { shift_id: 'a', shift_ids: null };
  const camp = { shift_id: null, shift_ids: null };

  it('reads legacy, shared and camp-wide schedules', () => {
    expect(audienceOf(shared)).toEqual(['a', 'b']);
    expect(audienceOf(single)).toEqual(['a']);
    expect(audienceOf(camp)).toBeNull();
  });

  it('shows a shared schedule only to its shifts', () => {
    expect(visibleToShift(shared, 'a')).toBe(true);
    expect(visibleToShift(shared, 'c')).toBe(false);
    expect(visibleToShift(camp, 'c')).toBe(true);
    expect(visibleToShift(single, null)).toBe(true);
  });

  it('matches scopes regardless of order', () => {
    expect(sameAudience(shared, ['a', 'b'])).toBe(true);
    expect(sameAudience(single, ['a', 'b'])).toBe(false);
    expect(sameAudience(camp, [])).toBe(true);
    expect(touchesShifts(single, ['b', 'a'])).toBe(true);
    expect(touchesShifts(single, ['c'])).toBe(false);
  });

  it('keeps shift_id for single-shift writes only', () => {
    expect(audiencePayload(['a'])).toEqual({ shift_id: 'a', shift_ids: ['a'] });
    expect(audiencePayload(['b', 'a'])).toEqual({ shift_id: null, shift_ids: ['a', 'b'] });
    expect(audiencePayload([])).toEqual({ shift_id: null, shift_ids: null });
  });
});
