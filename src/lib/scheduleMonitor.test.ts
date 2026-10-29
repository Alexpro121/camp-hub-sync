import { describe, expect, it, vi } from 'vitest';
import { monitorScheduleStream } from '../../supabase/functions/generate-schedule/monitor';

describe('schedule error monitoring', () => {
  it('preserves streamed bytes and logs only structured error codes, not private text', async () => {
    const text = 'data: {"candidates":[{"content":{"parts":[{"text":"Private child text"}]}}]}\n\ndata: {"error":{"code":503,"status":"UNAVAILABLE","message":"Private provider message"}}\n\n';
    const log = vi.fn();
    const body = new Response(text).body;
    if (!body) throw new Error('Missing test stream');
    expect(await new Response(monitorScheduleStream(body, 'request-id', log)).text()).toBe(text);
    expect(log).toHaveBeenCalledExactlyOnceWith({ requestId: 'request-id', stage: 'stream', code: 503, status: 'UNAVAILABLE' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Private');
  });
  it('records a missing completion and does not log successful streams as errors', async () => {
    const log = vi.fn();
    for (const [text, id] of [['data: {"candidates":[{"finishReason":"STOP"}]}\n\n', 'success'], ['data: {"candidates":[]}\n\n', 'incomplete']]) {
      const body = new Response(text).body;
      if (!body) throw new Error('Missing test stream');
      await new Response(monitorScheduleStream(body, id, log)).text();
    }
    expect(log).toHaveBeenCalledExactlyOnceWith({ requestId: 'incomplete', stage: 'stream', reason: 'INCOMPLETE_STREAM' });
  });
});