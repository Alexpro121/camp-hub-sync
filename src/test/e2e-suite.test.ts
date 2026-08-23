import { describe, it, expect } from 'vitest';
import { normalizeTime, normalizeTimeRange, toMinutes, fromMinutes, shiftTime } from '@/lib/scheduleCategories';
import { normalizeScheduleItems, ongoingEvents, dedupeItems } from '@/lib/schedule';
import { isFairEvent, resolveFairWindow, isFairCurrentlyActive } from '@/lib/fair-resolver';
import { buildRunningOrder } from '@/lib/talent';
import { parseSequentialTrainText, parseTrainTextGroupedByTeams } from '@/lib/train-parser';
import { resolveShiftPhase, resolveTeamShiftStatus, parseTeamsInput } from '@/lib/shift-resolver';
import { generateShortCode, FAIR_CODE_LENGTH, isFairScheduleActive } from '@/lib/fair';
import { detectCategory } from '@/lib/schedule-parser-fallback';
import { levenshtein, findNameSuggestions, parseTeamNumber } from '@/lib/normalize';
import { SINGLE_TRIP, TRAIN_TITLE, tripName } from '@/lib/trips';

const item = (o: Partial<any>): any => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  schedule_id: 's', time_start: null, time_end: null, title: 'x', description: null,
  target_teams: [], order_index: 0, has_sub_slots: false, sub_slots: [], category: 'general',
  created_at: '', updated_at: '', ...o,
});

// ---- BLOCK 6.x time formats ----
describe('B6 · time normalization', () => {
  it('accepts dots, colons, spaces, dashes and compact forms', () => {
    ['14:25', '14.25', '14 25', '14-25', '1425'].forEach((t) => expect(normalizeTime(t)).toBe('14:25'));
    expect(normalizeTime('9')).toBe('09:00');
    expect(normalizeTime('25:00')).toBeNull();
    expect(normalizeTime('')).toBeNull();
  });
  it('splits ranges in any separator', () => {
    expect(normalizeTimeRange('14.25 - 14.56')).toEqual({ start: '14:25', end: '14:56' });
    expect(normalizeTimeRange('14:25—14:56')).toEqual({ start: '14:25', end: '14:56' });
  });
  it('shifts time by +/-15 min with wrap', () => {
    expect(shiftTime('14:25', 15)).toBe('14:40');
    expect(shiftTime('00:05', -15)).toBe('23:50');
    expect(fromMinutes(toMinutes('23:59')!)).toBe('23:59');
  });
});

// ---- BLOCK 6.3 cross-midnight ----
describe('B6 · cross-midnight events', () => {
  const items = [item({ id: 'a', time_start: '23:56', time_end: '00:30', title: 'Нічна подія' })];
  const events = normalizeScheduleItems(items, '2026-09-17');
  it('rolls the end into the next day', () => {
    expect(events[0].crossesMidnight).toBe(true);
    expect(events[0].endAt.getTime() - events[0].startAt.getTime()).toBe(34 * 60_000);
  });
  it('stays live after 00:00', () => {
    expect(ongoingEvents(events, new Date('2026-09-18T00:10:00')).length).toBe(1);
    expect(ongoingEvents(events, new Date('2026-09-18T00:31:00')).length).toBe(0);
  });
});

// ---- BLOCK 6.4 merging / dedupe ----
describe('B6 · multi-schedule merge', () => {
  it('drops duplicates by start time + title', () => {
    const merged = dedupeItems([
      item({ id: '1', time_start: '10:00', title: 'Обід' }),
      item({ id: '2', time_start: '10:00', title: 'обід' }),
      item({ id: '3', time_start: '11:00', title: 'Обід' }),
    ]);
    expect(merged).toHaveLength(2);
  });
  it('categorizes text', () => {
    expect(detectCategory('Обід у їдальні')).toBe('meal');
    expect(detectCategory('Футбол')).toBe('sports');
  });
});

// ---- BLOCK 8 fair ----
describe('B8 · fair detection and window', () => {
  it('detects every Ukrainian case of Ярмарок', () => {
    ['Ярмарок', 'Ярмарка', 'ЯРМАРКИ', 'ярмарков'].forEach((t) => expect(isFairEvent({ title: t })).toBe(true));
    expect(isFairEvent({ title: 'Обід' })).toBe(false);
    expect(isFairScheduleActive([{ title: 'Ярмарка' }])).toBe(true);
  });
  it('stays active the whole 18:26–18:56 window', () => {
    const groups = [{ date: '2026-09-17', items: [item({ time_start: '18:26', time_end: '18:56', title: 'Ярмарка' })] }];
    expect(isFairCurrentlyActive(groups, new Date('2026-09-17T18:26:00'))).toBe(true);
    expect(isFairCurrentlyActive(groups, new Date('2026-09-17T18:40:00'))).toBe(true);
    expect(isFairCurrentlyActive(groups, new Date('2026-09-17T18:55:59'))).toBe(true);
    expect(isFairCurrentlyActive(groups, new Date('2026-09-17T18:56:00'))).toBe(false);
    expect(isFairCurrentlyActive(groups, new Date('2026-09-17T18:00:00'))).toBe(false);
  });
  it('reports the upcoming fair start', () => {
    const evs = normalizeScheduleItems([item({ time_start: '18:26', time_end: '18:56', title: 'Ярмарок' })], '2026-09-17');
    const w = resolveFairWindow(evs, new Date('2026-09-17T12:00:00'));
    expect(w.active).toBe(false);
    expect(w.startsAt).toBe(new Date('2026-09-17T18:26:00').getTime());
  });
  it('generates 5-digit numeric codes', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateShortCode();
      expect(c).toMatch(/^\d{5}$/);
      expect(c).toHaveLength(FAIR_CODE_LENGTH);
    }
  });
});

// ---- BLOCK 4 train ----
describe('B4 · sequential train parser', () => {
  const text = `5 команда
Ковальчук Іван Іванович
Львів
.
Петренко Марія Петрівна
SS
Сидоренко Олег Олегович
6 команда
Іваненко Ганна Іванівна
Шевченко Тарас Григорович`;
  const rows = parseSequentialTrainText(text);
  it('advances the seat counter on . and SS without creating passengers', () => {
    const t5 = rows.filter((r) => r.teamNumber === 5);
    expect(t5.map((r) => r.seatNumber)).toEqual([1, 3, 5]);
    expect(t5[0].boardingCity).toBe('Львів');
  });
  it('gives every team its own coupes starting at 1', () => {
    const t6 = rows.filter((r) => r.teamNumber === 6);
    expect(t6.map((r) => r.seatNumber)).toEqual([1, 2]);
    expect(t6.every((r) => r.coupeNumber === 1)).toBe(true);
  });
  it('keeps max 4 seats per coupe and isolates teams in groups', () => {
    const groups = parseTrainTextGroupedByTeams(text);
    expect(groups.map((g) => g.teamNumber)).toEqual([5, 6]);
    groups.forEach((g) => {
      expect(g.coupes.length).toBeGreaterThanOrEqual(10);
      g.coupes.forEach((c) => expect(c.passengers.length).toBeLessThanOrEqual(4));
    });
  });
  it('handles tabs and per-line team format', () => {
    const inline = parseSequentialTrainText('Абдулов Іван Ігорович\t- 6 команда\nБаркова Олена Петрівна - 7 команда');
    expect(inline.map((p) => p.teamNumber).sort()).toEqual([6, 7]);
  });
  it('names trips', () => {
    expect(SINGLE_TRIP).toBe(1);
    expect(tripName()).toBe(TRAIN_TITLE);
  });
});

// ---- BLOCK 7 shift phases ----
describe('B7 · multi-phase shift resolver', () => {
  const long: any = {
    id: 'l', name: 'Довга', shift_type: 'long', shift_category: 'long',
    start_date: '2026-09-10', end_date: '2026-09-25', hotel_start_date: '2026-09-16',
    assigned_teams: [1, 2, 3], deleted_at: null, is_active: true,
  };
  const short: any = { ...long, id: 's', name: 'Коротка', shift_category: 'short', start_date: '2026-09-16', hotel_start_date: '2026-09-16', assigned_teams: [8] };
  it('resolves long-shift travel then Bukovel', () => {
    expect(resolveShiftPhase(long, new Date('2026-09-05')).currentPhase).toBe('PREPARING');
    expect(resolveShiftPhase(long, new Date('2026-09-12')).currentPhase).toBe('TRAVEL_PHASE');
    expect(resolveShiftPhase(long, new Date('2026-09-18')).currentPhase).toBe('JOINT_BUKOVEL_PHASE');
    expect(resolveShiftPhase(long, new Date('2026-09-30')).currentPhase).toBe('FINISHED');
  });
  it('short shift waits then joins Bukovel', () => {
    expect(resolveShiftPhase(short, new Date('2026-09-14')).currentPhase).toBe('PREPARING');
    expect(resolveShiftPhase(short, new Date('2026-09-17')).currentPhase).toBe('JOINT_BUKOVEL_PHASE');
  });
  it('picks the shift by team number', () => {
    expect(resolveTeamShiftStatus([long, short], 8, new Date('2026-09-17'))?.shiftName).toBe('Коротка');
    expect(resolveTeamShiftStatus([long, short], 2, new Date('2026-09-12'))?.currentPhase).toBe('TRAVEL_PHASE');
    expect(resolveTeamShiftStatus([long, short], 99, new Date('2026-09-12'))).toBeNull();
  });
  it('parses team ranges', () => {
    expect(parseTeamsInput('1,2 5-7')).toEqual([1, 2, 5, 6, 7]);
  });
});

// ---- BLOCK 9 talent ----
describe('B9 · talent running order', () => {
  const e = (id: string, team: number, brk = 0, i = 0) => ({ id, team_number: team, title: id, break_needed_after: brk, order_index: i });
  it('never places the same team back-to-back when avoidable', () => {
    const order = buildRunningOrder([e('a', 1, 0, 0), e('b', 1, 0, 1), e('c', 2, 0, 2), e('d', 3, 0, 3)]);
    for (let i = 1; i < order.length; i++) expect(order[i].team_number).not.toBe(order[i - 1].team_number);
    expect(order.map((o) => o.order_index)).toEqual([0, 1, 2, 3]);
  });
  it('respects break_needed_after gaps', () => {
    const order = buildRunningOrder([e('a', 1, 2, 0), e('b', 1, 2, 1), e('c', 2, 0, 2), e('d', 3, 0, 3)]);
    const idx = order.map((o) => o.team_number).reduce<number[]>((acc, t, i) => (t === 1 ? [...acc, i] : acc), []);
    expect(idx[1] - idx[0]).toBeGreaterThanOrEqual(2);
  });
});

// ---- BLOCK 1 name matching ----
describe('B1 · login name matching', () => {
  it('scores fuzzy suggestions', () => {
    expect(levenshtein('іванов', 'іваном')).toBe(1);
    const s = findNameSuggestions('Іванов Іван', [{ full_name: 'Іванов Іван Іванович' } as any, { full_name: 'Петренко Олег' } as any]);
    expect(s[0].item.full_name).toContain('Іванов');
  });
  it('parses team numbers from noisy input', () => {
    expect(parseTeamNumber('№12')).toBe(12);
    expect(parseTeamNumber('8 команда')).toBe(8);
  });
});


// ---- BLOCK 10 hardening guards ----
describe('B10 · hardening guards', () => {
  it('rejects out-of-range team numbers on import', () => {
    expect(isValidTeamNumber(99)).toBe(false);
    expect(isValidTeamNumber(0)).toBe(false);
    expect(isValidTeamNumber(120)).toBe(false);
    expect(isValidTeamNumber(12)).toBe(true);
  });
  it("treats ь before a iotated vowel as an apostrophe", () => {
    expect(normalizeName("Лукьянов Іван")).toBe(normalizeName("Лук'янов Іван"));
  });
  it('keeps permanent server rejections out of the offline queue', () => {
    expect(isPermanentError(new Error('insufficient_funds'))).toBe(true);
    expect(isPermanentError(new Error('fair_closed'))).toBe(true);
    expect(isPermanentError(new Error('awaiting_target_consent'))).toBe(true);
    expect(isPermanentError(new Error('Failed to fetch'))).toBe(false);
  });
});
