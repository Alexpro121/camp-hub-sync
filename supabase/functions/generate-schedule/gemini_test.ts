import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { requestSchedule, SCHEDULE_MODEL } from './gemini.ts';
Deno.test('schedule generation uses selected lightweight model, schema and stop signal without retries', async () => {
  let calls = 0;
  const controller = new AbortController();
  const fetcher: typeof fetch = (input, options) => {
    calls++;
    assertStringIncludes(String(input), `${SCHEDULE_MODEL}:streamGenerateContent?alt=sse`);
    assertEquals(options?.signal, controller.signal);
    const body = JSON.parse(String(options?.body));
    assertEquals(body.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON');
    assertEquals(body.generationConfig.responseFormat.text.schema.required, ['days']);
    assertEquals(body.generationConfig.temperature, undefined);
    return Promise.resolve(new Response('{}', { status: 403 }));
  };
  assertEquals((await requestSchedule('test-only', '09:00 Сніданок', '2026-10-29', controller.signal, fetcher)).status, 403);
  assertEquals(calls, 1);
});