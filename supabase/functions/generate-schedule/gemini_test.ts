import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { cleanApiKey, parseApiKeys, requestSchedule, requestScheduleWithKeys, resetKeyPreference, SCHEDULE_MODEL } from './gemini.ts';
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
Deno.test('api key from secrets is cleaned or rejected before reaching fetch headers', () => {
  assertEquals(cleanApiKey('  "AIzaTestKey1234567890"\n'), 'AIzaTestKey1234567890');
  assertEquals(cleanApiKey('AIza Test\r\nKey1234567890'), 'AIzaTestKey1234567890');
  assertEquals(cleanApiKey('AIzaКлюч1234567890'), null);
  assertEquals(cleanApiKey(''), null);
  assertEquals(cleanApiKey(undefined), null);
});

Deno.test('several keys are parsed, deduplicated and broken ones counted', () => {
  assertEquals(parseApiKeys('keyAAAAAAAAAA1, keyBBBBBBBBBB2;keyAAAAAAAAAA1\nключ'), { keys: ['keyAAAAAAAAAA1', 'keyBBBBBBBBBB2'], rejected: 1 });
});

Deno.test('rotates to the next key on auth or quota failures and remembers the working one', async () => {
  resetKeyPreference();
  const seen: string[] = [];
  const skipped: number[] = [];
  const fetcher: typeof fetch = (_input, options) => {
    const key = new Headers(options?.headers).get('x-goog-api-key')!;
    seen.push(key);
    return Promise.resolve(new Response('{}', { status: key === 'good-key-0000' ? 200 : key === 'quota-key-000' ? 429 : 403 }));
  };
  const keys = ['bad-key-00000', 'quota-key-000', 'good-key-0000'];
  const first = await requestScheduleWithKeys(keys, 'x', '2026-11-20', new AbortController().signal, fetcher, (e) => skipped.push(e.code ?? 0));
  assertEquals([first.response.status, first.keyIndex], [200, 2]);
  assertEquals(skipped, [403, 429]);
  seen.length = 0;
  await requestScheduleWithKeys(keys, 'x', '2026-11-20', new AbortController().signal, fetcher);
  assertEquals(seen, ['good-key-0000']);
});

Deno.test('does not rotate on provider outages and returns the last failure', async () => {
  resetKeyPreference();
  let calls = 0;
  const fetcher: typeof fetch = () => { calls++; return Promise.resolve(new Response('{}', { status: 503 })); };
  const result = await requestScheduleWithKeys(['k1-aaaaaaaaaa', 'k2-aaaaaaaaaa'], 'x', '2026-11-20', new AbortController().signal, fetcher);
  assertEquals([result.response.status, calls], [503, 1]);
});
