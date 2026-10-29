import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseScheduleSmartTwoPhase } from './schedule-chunk-parser';
const { invoke, getSession } = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession, refreshSession: vi.fn() }, functions: { invoke } } }));
beforeEach(() => {
  invoke.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 'test' } } });
});
describe('schedule request context and cancellation', () => {
  it('does not split a long day into incomplete independent requests', async () => {
    const rawText = '29.10\nкоманди 3–5\n09:00 Сніданок\n' + 'Нотатка\n'.repeat(200);
    invoke.mockResolvedValue({ data: { source: 'ai', items: [{ title: 'Сніданок', time_start: '09:00', target_teams: [3, 4, 5] }] } });
    const result = await parseScheduleSmartTwoPhase(rawText);
    expect(result.success).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('parse-schedule-ai', { body: { rawText }, signal: undefined });
  });
  it('does not invoke after cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    expect((await parseScheduleSmartTwoPhase('09:00 Гра', controller.signal)).reason).toBe('aborted');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('rejects oversized text instead of sending unsupported input', async () => {
    expect((await parseScheduleSmartTwoPhase('а'.repeat(25001))).reason).toBe('input_too_large');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('returns explicit failure when the service falls back', async () => {
    invoke.mockResolvedValue({ data: { source: 'fallback', reason: 'schema_mismatch', items: [] } });
    expect(await parseScheduleSmartTwoPhase('09:00 Гра')).toMatchObject({ success: false, reason: 'schema_mismatch', items: [] });
  });
});