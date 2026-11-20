import { describe, expect, it } from 'vitest';
import { findOverlaps, rangeOf } from './scheduleOverlap';
import type { ScheduleItem } from '@/types/app';

const it_ = (p: Partial<ScheduleItem>): ScheduleItem => ({
  id: p.id ?? 'x', schedule_id: 's', title: 'Подія', time_start: '10:00', time_end: '11:00', description: null,
  target_teams: [], order_index: 0, has_sub_slots: false, sub_slots: [], ...p,
} as ScheduleItem);

describe('team event overlaps', () => {
  const day = [
    it_({ id: 'all', title: 'Сніданок', time_start: '08:30', time_end: '09:00' }),
    it_({ id: 'mine', title: 'Квест', time_start: '10:00', time_end: '11:30', target_teams: [7] }),
    it_({ id: 'other', title: 'Чужа', time_start: '10:00', time_end: '12:00', target_teams: [6] }),
    it_({ id: 'slot', title: 'Обід', time_start: '13:00', time_end: '14:30', has_sub_slots: true, sub_slots: [{ time: '13:30', teams: [7] }] }),
    it_({ id: 'night', title: 'Нічна', time_start: '23:30', time_end: '00:30' }),
  ];

  it('finds events of own team and for everyone, ignoring other teams', () => {
    expect(findOverlaps({ time_start: '08:45', time_end: '10:15' }, day, 7).map((i) => i.id)).toEqual(['all', 'mine']);
    expect(findOverlaps({ time_start: '13:15', time_end: '13:45' }, day, 7).map((i) => i.id)).toEqual(['slot']);
  });

  it('treats touching edges as no overlap and skips the edited event itself', () => {
    expect(findOverlaps({ time_start: '09:00', time_end: '10:00' }, day, 7)).toEqual([]);
    expect(findOverlaps({ time_start: '10:30', time_end: '11:00' }, day, 7, 'mine')).toEqual([]);
  });

  it('handles events without an end and past midnight', () => {
    expect(rangeOf('23:30', '00:30')).toEqual({ start: 1410, end: 1470 });
    expect(findOverlaps({ time_start: '23:50', time_end: null }, day, 7).map((i) => i.id)).toEqual(['night']);
  });
});
