/** SCENARIO 2: 429 rate-limit failover across the Groq key pool. */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.env.set('GROQ_API_KEYS', ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'].join(','));
const { fetchGroqWithFallback, groqKeyCount } = await import('./groq-pool.ts');

const realFetch = globalThis.fetch;
const usedKeys: string[] = [];

function stubFetch(handler: (key: string, attempt: number) => Response) {
  let attempt = 0;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    const key = String((init?.headers as Record<string, string>)?.Authorization ?? '').replace('Bearer ', '');
    usedKeys.push(key);
    return Promise.resolve(handler(key, attempt++));
  }) as typeof fetch;
}

Deno.test('pool holds all 7 keys', () => assertEquals(groqKeyCount(), 7));

Deno.test('HTTP 429 on the first key transparently rolls over to the next key', async () => {
  usedKeys.length = 0;
  stubFetch((_key, attempt) =>
    attempt === 0
      ? new Response('{"error":"rate_limit_exceeded"}', { status: 429 })
      : new Response(JSON.stringify({ choices: [{ message: { content: '[]' } }] }), { status: 200 }));

  const { data, keyUsedIndex } = await fetchGroqWithFallback({ model: 'x' }, 500);
  assertEquals(usedKeys.length, 2, 'exactly one retry after the 429');
  assertEquals(usedKeys[0] !== usedKeys[1], true, 'a different key served the retry');
  assertEquals(typeof keyUsedIndex, 'number');
  assertEquals(data.choices[0].message.content, '[]');
  globalThis.fetch = realFetch;
});

Deno.test('all 7 keys rate-limited -> throws so the caller can fall back locally', async () => {
  usedKeys.length = 0;
  stubFetch(() => new Response('rate limited', { status: 429 }));
  let message = '';
  try {
    await fetchGroqWithFallback({ model: 'x' }, 500);
  } catch (e) {
    message = (e as Error).message;
  }
  assertEquals(usedKeys.length, 7, 'every key in the pool was tried');
  assertStringIncludes(message, 'exhausted');
  globalThis.fetch = realFetch;
});

Deno.test('network timeout on a key also rolls over', async () => {
  usedKeys.length = 0;
  stubFetch((_k, attempt) =>
    attempt === 0
      ? (() => { throw new Error('timeout'); })()
      : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
  const { data } = await fetchGroqWithFallback({ model: 'x' }, 300);
  assertEquals(data.choices[0].message.content, 'ok');
  assertEquals(usedKeys.length, 2);
  globalThis.fetch = realFetch;
});
