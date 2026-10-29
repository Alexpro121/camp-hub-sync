import { describe, expect, it } from 'vitest';
import { ScheduleStreamPreview } from './scheduleStreamPreview';

describe('live schedule events', () => {
  it('emits complete events before a day or document has finished, never partial objects', () => {
    const parser = new ScheduleStreamPreview('2026-10-29');
    const first = '{"days":[{"date":"2026-02-24","items":[{"title":"Гра } \\" test","time_start":"09:00","sub_slots":[{"time":"09:05","teams":[1]}]}';
    expect(parser.update(first.slice(0, -1))).toBeNull();
    const result = parser.update(first);
    expect(JSON.parse(result ?? '[]')).toEqual([expect.objectContaining({ date: '2026-02-24', time_start: '09:00' })]);
    expect(parser.update(first + ',{"title":"Сніданок","time_start":')).toBeNull();
    const second = parser.update(first + ',{"title":"Сніданок","time_start":"10:00"}]}]}');
    expect(JSON.parse(second ?? '[]')).toHaveLength(2);
  });
  it('preserves each streamed day and does not re-emit old events for every text chunk', () => {
    const parser = new ScheduleStreamPreview('2026-10-29');
    const text = '{"days":[{"date":"2026-02-24","items":[{"title":"A","time_start":"09:00"}]},{"date":"2026-02-25","items":[{"title":"B","time_start":"10:00"}]}]}';
    let result = '';
    for (let index = 1; index <= text.length; index++) result = parser.update(text.slice(0, index)) ?? result;
    expect(JSON.parse(result).map((event: { date: string }) => event.date)).toEqual(['2026-02-24', '2026-02-25']);
  });
});