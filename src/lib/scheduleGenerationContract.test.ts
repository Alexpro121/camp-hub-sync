import { describe, expect, it } from 'vitest';
import { scheduleRequest } from '../../supabase/functions/generate-schedule/gemini';

describe('AI schedule end-time contract', () => {
  it('requires a non-null string end for every generated event', () => {
    const request = scheduleRequest('08:00 Підйом\n08:10 Зарядка', '2026-10-29');
    const item = request.generationConfig.responseFormat.text.schema.properties.days.items.properties.items.items;
    expect(item.required).toContain('time_end');
    expect(item.properties.time_end.type).toBe('string');
  });
});