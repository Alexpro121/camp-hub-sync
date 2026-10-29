import { describe, expect, it } from 'vitest';
import { previewScheduleImport } from './scheduleImport';

const exercise = { title: 'Зарядка', time_start: '08:30', time_end: '09:15', description: 'Завершення орієнтовне', target_teams: [] as number[] };
const breakfast = { title: 'Сніданок', time_start: '09:00', time_end: '10:00', target_teams: [] as number[], sub_slots: ['09:00', '09:15', '09:30', '09:45'].map((time, index) => ({ time, teams: [index + 1] })) };
const preview = (items: unknown[]) => previewScheduleImport(JSON.stringify({ date: '2026-10-29', items }), '2026-10-29');

describe('estimated schedule boundaries', () => {
  it('ends 08:30 exercise at 09:00 breakfast, preserving all four meal slots', () => {
    const result = preview([exercise, breakfast]);
    expect(result.errors).toEqual([]);
    expect(result.days[0].items[0].time_end).toBe('09:00');
    expect(result.days[0].items[1].time_end).toBe('10:00');
    expect(result.days[0].items[1].sub_slots).toHaveLength(4);
  });
  it('uses chronological boundaries even when source blocks are out of order', () => {
    expect(preview([breakfast, exercise]).days[0].items[0].time_end).toBe('09:00');
  });
  it('preserves explicit source ends', () => {
    expect(preview([{ ...exercise, description: null }, breakfast]).days[0].items[0].time_end).toBe('09:15');
  });
  it('does not truncate parallel events for disjoint teams', () => {
    expect(preview([{ ...exercise, target_teams: [1] }, { ...breakfast, target_teams: [2], sub_slots: [] }]).days[0].items[0].time_end).toBe('09:15');
  });
  it('bounds partial team intersections', () => {
    expect(preview([{ ...exercise, target_teams: [1, 2] }, { ...breakfast, target_teams: [2, 3], sub_slots: [] }]).days[0].items[0].time_end).toBe('09:00');
  });
  it('keeps equal-start parallel activities positive', () => {
    expect(preview([exercise, { ...breakfast, time_start: '08:30' }]).days[0].items[0].time_end).toBe('09:15');
  });
  it('blocks impossible estimated meal bounds instead of removing later slots', () => {
    const result = preview([{ ...breakfast, description: exercise.description }, { ...exercise, title: 'Лекція', time_start: '09:30', time_end: '10:15' }]);
    expect(result.errors).toHaveLength(1);
    expect(result.days[0].items[0].sub_slots).toHaveLength(4);
  });
  it('bounds overnight estimates by the next day event', () => {
    const result = previewScheduleImport(JSON.stringify({ days: [
      { date: '2026-10-29', items: [{ ...exercise, time_start: '23:30', time_end: '00:30' }] },
      { date: '2026-10-30', items: [{ ...exercise, title: 'Збір', time_start: '00:15', time_end: '00:25' }] },
    ] }), '2026-10-29');
    expect(result.days[0].items[0].time_end).toBe('00:15');
  });
});