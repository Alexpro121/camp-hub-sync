import { describe, expect, it } from 'vitest';
import { normalizeScheduleItems } from './schedule';
import { scheduleToHtml, scheduleToText } from './scheduleShare';
import type { ScheduleItem, ScheduleSubSlot } from '@/types/app';

const item = (p: Partial<ScheduleItem>): ScheduleItem => ({
  id: p.id ?? 'x', schedule_id: 's', title: 'Подія', time_start: '09:00', time_end: '10:00', category: 'general',
  target_teams: [], order_index: 0, location: null, description: null, sub_slots: null, has_sub_slots: false, ...p,
} as ScheduleItem);

describe('scheduleToText', () => {
  const events = normalizeScheduleItems([
    item({ id: 'a', title: 'сніданок', category: 'meal', location: 'Їдальня', time_start: '08:30', time_end: '09:00' }),
    item({ id: 'b', title: 'Квест <2>', time_start: '10:00', time_end: '12:00', has_sub_slots: true,
      sub_slots: [{ time: '10:00', teams: [1, 2] }, { time: '11:00', teams: [3] }] as ScheduleSubSlot[] }),
  ], '2026-11-20');
  const slotsOf = (e: (typeof events)[number]) => (e.item.sub_slots as ScheduleSubSlot[] | null) ?? [];

  it('formats a readable day for Telegram', () => {
    const text = scheduleToText({ dateISO: '2026-11-20', team: null, events, slotsOf });
    expect(text.split('\n')[0]).toBe('📅 Розклад · Пʼятниця, 20 листопада');
    expect(text).toContain('🍽 08:30–09:00  Сніданок');
    expect(text).toContain('📍 Їдальня');
    expect(text).toContain('⏰ 11:00 → команди 3');
  });

  it('shows only the team slot when filtered and escapes HTML', () => {
    const input = { dateISO: '2026-11-20', team: 3, events, slotsOf };
    expect(scheduleToText(input)).toContain('⏰ Ваш час: 11:00');
    expect(scheduleToText(input)).not.toContain('команди 1, 2');
    expect(scheduleToHtml(input)).toContain('<b>🔹 10:00–12:00  Квест &lt;2&gt;</b>');
  });

  it('keeps multiline descriptions and indents in the HTML copy', () => {
    const ev = normalizeScheduleItems([item({ id: 'c', title: 'Похід', description: 'Взяти воду\nКепка обовʼязково' })], '2026-11-20');
    const html = scheduleToHtml({ dateISO: '2026-11-20', team: null, events: ev, slotsOf: () => [] });
    expect(html).toContain('<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Взяти воду<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Кепка обовʼязково');
  });
});
