import { describe, expect, it } from 'vitest';
import { previewScheduleImport, scheduleImportKey } from './scheduleImport';
import { cleanAndParseScheduleJson } from './json-sanitizer';
import { dedupeItems } from './schedule';
import { extractTeams } from './scheduleParser';
import { normalizeTime } from './scheduleCategories';

const date = '2026-10-29';
const event = { title: 'Майстер-клас', time_start: '9:5', time_end: '10.00', target_teams: [2, '1', 2] };
const preview = (value: unknown) => previewScheduleImport(JSON.stringify(value), date);

describe('validated schedule imports', () => {
  it.each([
    { date, items: [event] }, [{ date, items: [event] }], { days: [{ date, items: [event] }] }, [event], { events: [event] },
  ])('accepts supported document shapes', (input) => {
    const result = preview(input);
    expect(result.errors).toEqual([]);
    expect(result.days[0].items[0]).toMatchObject({ time_start: '09:05', time_end: '10:00', target_teams: [1, 2] });
  });
  it.each([null, { ...event, title: 7 }, { ...event, target_teams: '1,2' }, { ...event, time_start: '99:99' }, { ...event, time_end: 'oops' }, { ...event, target_teams: [1.5] }])('blocks malformed events instead of silently dropping them', (item) => {
    expect(preview({ date, items: [event, item] }).errors.length).toBeGreaterThan(0);
  });
  it('rejects impossible calendar dates', () => {
    expect(preview({ date: '2026-02-30', items: [event] }).errors.length).toBeGreaterThan(0);
    expect(preview({ date: '2028-02-29', items: [event] }).errors).toEqual([]);
  });
  it('does not silently drop a malformed day in a mixed document', () => {
    expect(preview([{ date, items: [event] }, { date: '2026-10-30', items: null }]).errors.length).toBeGreaterThan(0);
  });
  it('supports a range pasted in the start field', () => {
    expect(preview([{ ...event, time_start: '14.25 - 14.56', time_end: null }]).days[0].items[0]).toMatchObject({ time_start: '14:25', time_end: '14:56' });
  });
  it('preserves dates on a bare events array', () => {
    const result = preview([{ ...event, date }, { ...event, date: '2026-10-30' }]);
    expect(result.days.map((day) => day.date)).toEqual([date, '2026-10-30']);
  });
  it('merges repeated dates and removes only true duplicate events', () => {
    const result = preview([{ date, items: [event] }, { date, items: [event, { ...event, target_teams: [3] }] }]);
    expect(result.days).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.duplicates).toBe(1);
  });
  it('preserves parallel teams and locations in shared schedule reads', () => {
    expect(dedupeItems([event, { ...event, target_teams: [3] }, { ...event, location: 'Зала AB' }])).toHaveLength(3);
    expect(scheduleImportKey(event)).toBe(scheduleImportKey({ ...event, target_teams: [1, 2] }));
  });
  it('validates staggered times and infers the subslot flag', () => {
    const result = preview([{ ...event, sub_slots: [{ time: '09.30', teams: [1] }] }]);
    expect(result.errors).toEqual([]);
    expect(result.days[0].items[0].has_sub_slots).toBe(true);
    expect(result.days[0].items[0].sub_slots[0].time).toBe('09:30');
    expect(preview([{ ...event, sub_slots: [{ time: '11:00', teams: [1] }] }]).errors.length).toBeGreaterThan(0);
  });
  it('supports midnight-crossing events and slots', () => {
    expect(preview([{ ...event, time_start: '23:30', time_end: '00:30', sub_slots: [{ time: '00:05', teams: [1] }] }]).errors).toEqual([]);
  });
  it('keeps unknown ends empty rather than inventing source data', () => {
    const result = preview([{ ...event, time_end: null }]);
    expect(result.days[0].items[0].time_end).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });
});

describe('non-destructive copied JSON repair', () => {
  it('preserves HTML entities in valid JSON', () => {
    expect(cleanAndParseScheduleJson('{"title":"Say &quot;hello&quot;"}')).toEqual({ title: 'Say &quot;hello&quot;' });
  });
  it('repairs trailing commas without changing strings', () => {
    expect(cleanAndParseScheduleJson('```json\n{"title":"A,] B,} «Гра»", "url":"https://example.org/a",}\n```')).toEqual({ title: 'A,] B,} «Гра»', url: 'https://example.org/a' });
  });
  it('extracts JSON from prose without consuming following brackets', () => {
    expect(cleanAndParseScheduleJson('Ось: {"title":"Гра } ["} Готово {коментар}')).toEqual({ title: 'Гра } [' });
  });
});

describe('human time and team parsing', () => {
  it('reads single-digit minutes literally', () => { expect(normalizeTime('9:5')).toBe('09:05'); });
  it('never treats timestamps as teams', () => { expect(extractTeams('10:30 - 1 команда: Гра')).toEqual([1]); });
  it.each(['команди 3-5', '3–5 команди'])('expands a qualified range: %s', (text) => { expect(extractTeams(text)).toEqual([3, 4, 5]); });
  it('handles several separate qualified groups', () => { expect(extractTeams('1 і 2 команди; команди 7 та 8')).toEqual([1, 2, 7, 8]); });
});