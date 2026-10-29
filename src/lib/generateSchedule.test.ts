import { describe, expect, it, vi } from 'vitest';
import { readScheduleStream } from './generateSchedule';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const event = (text: string, finishReason?: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] })}\n\n`;
describe('Gemini schedule streams', () => {
  it('identifies the observed mid-stream 503 overload instead of reporting a refusal', async () => {
    const failure = 'data: {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}\n\n';
    const response = new Response(event('{"days":[') + failure, { headers: { 'x-schedule-request-id': 'request-503' } });
    await expect(readScheduleStream(response, new AbortController().signal, vi.fn())).rejects.toThrow('Gemini перевантажений. Спробуйте пізніше. (503 · UNAVAILABLE) Неповний розклад не збережено. Код звернення: request-503');
  });
  it('keeps quota, refusal and token-limit codes distinct', async () => {
    await expect(readScheduleStream(new Response('data: {"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}\n\n'), new AbortController().signal, vi.fn())).rejects.toThrow('429 · RESOURCE_EXHAUSTED');
    await expect(readScheduleStream(new Response(event('', 'MAX_TOKENS')), new AbortController().signal, vi.fn())).rejects.toThrow('MAX_TOKENS');
    await expect(readScheduleStream(new Response('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n'), new AbortController().signal, vi.fn())).rejects.toThrow('SAFETY');
  });
  it('joins split UTF-8 SSE chunks and requires explicit completion', async () => {
    const bytes = new TextEncoder().encode(event('{"days":') + event('[]}', 'STOP'));
    const response = new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    } }));
    const changed = vi.fn();
    expect(await readScheduleStream(response, new AbortController().signal, changed)).toBe('{"days":[]}');
    expect(changed).toHaveBeenLastCalledWith('{"days":[]}');
  });
  it('rejects disconnected or token-limited results instead of repairing them into success', async () => {
    await expect(readScheduleStream(new Response(event('{"days":[')), new AbortController().signal, vi.fn())).rejects.toThrow('Неповна відповідь');
    await expect(readScheduleStream(new Response(event('{}', 'MAX_TOKENS')), new AbortController().signal, vi.fn())).rejects.toThrow('не завершив');
  });
  it('keeps server errors visible', async () => {
    await expect(readScheduleStream(new Response('{"error":"Google відхилив доступ"}', { status: 403 }), new AbortController().signal, vi.fn())).rejects.toThrow('Google відхилив доступ');
  });
  it('stops refusals and empty output', async () => {
    await expect(readScheduleStream(new Response('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n'), new AbortController().signal, vi.fn())).rejects.toThrow('відхилив');
    await expect(readScheduleStream(new Response(event('', 'STOP')), new AbortController().signal, vi.fn())).rejects.toThrow('Неповна відповідь');
  });
  it('honors an explicit stop', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readScheduleStream(new Response(event('{}', 'STOP')), controller.signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
  });
});