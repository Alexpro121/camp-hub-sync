/** Smart rotation pool for Groq API keys: balances load and skips rate-limited keys. */
const rawKeys = Deno.env.get('GROQ_API_KEYS') || Deno.env.get('GROQ_API_KEY') || '';
const apiKeys = rawKeys.split(',').map((k) => k.trim()).filter((k) => k.length > 0);

interface KeyMetadata {
  /** Epoch ms until which this key must not be used (HTTP 429 Retry-After). */
  backoffUntil: number;
  failures: number;
}

const keyMeta: KeyMetadata[] = apiKeys.map(() => ({ backoffUntil: 0, failures: 0 }));

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const hasGroqKeys = () => apiKeys.length > 0;
export const groqKeyCount = () => apiKeys.length;

export type GroqResult = { data: any; keyUsedIndex: number };

/** Tries every key in the pool (random start) until one answers OK, honouring 429 backoff. */
export async function fetchGroqWithFallback(payload: unknown, perKeyTimeoutMs = 15000): Promise<GroqResult> {
  if (apiKeys.length === 0) throw new Error('GROQ_API_KEYS pool is empty');

  let lastError: Error | null = null;
  const startIndex = Math.floor(Math.random() * apiKeys.length);

  for (let i = 0; i < apiKeys.length; i++) {
    const currentKeyIndex = (startIndex + i) % apiKeys.length;
    const currentKey = apiKeys[currentKeyIndex];
    const meta = keyMeta[currentKeyIndex];
    if (meta.backoffUntil && Date.now() < meta.backoffUntil) {
      console.warn(`[Groq Pool] Key #${currentKeyIndex} in backoff until ${new Date(meta.backoffUntil).toISOString()}, skipping...`);
      lastError = lastError ?? new Error(`Key #${currentKeyIndex} rate limited`);
      continue;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), perKeyTimeoutMs);
    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      if (response.ok) {
        meta.failures = 0;
        meta.backoffUntil = 0;
        return { data: JSON.parse(text), keyUsedIndex: currentKeyIndex };
      }
      meta.failures++;
      if (response.status === 429) {
        const header = response.headers.get('Retry-After');
        const retryAfterSec = header && Number.isFinite(parseInt(header, 10)) ? parseInt(header, 10) : 15;
        meta.backoffUntil = Date.now() + retryAfterSec * 1000;
        console.warn(`[Groq Pool] Key #${currentKeyIndex} hit 429. Backing off for ${retryAfterSec}s.`);
        lastError = new Error(`HTTP 429 Rate Limit on key #${currentKeyIndex}`);
        continue;
      }
      console.warn(`[Groq Pool] Key #${currentKeyIndex} failed HTTP ${response.status}. Retrying with next key...`);
      lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      meta.failures++;
      console.warn(`[Groq Pool] Key #${currentKeyIndex} timeout/error: ${msg}. Retrying with next key...`);
      lastError = err as Error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`All ${apiKeys.length} Groq API keys exhausted/failed. Last error: ${lastError?.message}`);
}
