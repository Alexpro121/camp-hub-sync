/** Smart rotation pool for Groq API keys: balances load and skips rate-limited keys. */
const rawKeys = Deno.env.get('GROQ_API_KEYS') || Deno.env.get('GROQ_API_KEY') || '';
const apiKeys = rawKeys.split(',').map((k) => k.trim()).filter((k) => k.length > 0);

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const hasGroqKeys = () => apiKeys.length > 0;
export const groqKeyCount = () => apiKeys.length;

export type GroqResult = { data: any; keyUsedIndex: number };

/** Tries every key in the pool (random start) until one answers OK. */
export async function fetchGroqWithFallback(payload: unknown, perKeyTimeoutMs = 6000): Promise<GroqResult> {
  if (apiKeys.length === 0) throw new Error('GROQ_API_KEYS pool is empty');

  let lastError: Error | null = null;
  const startIndex = Math.floor(Math.random() * apiKeys.length);

  for (let i = 0; i < apiKeys.length; i++) {
    const currentKeyIndex = (startIndex + i) % apiKeys.length;
    const currentKey = apiKeys[currentKeyIndex];
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
        return { data: JSON.parse(text), keyUsedIndex: currentKeyIndex };
      }
      console.warn(`[Groq Pool] Key #${currentKeyIndex} failed HTTP ${response.status}. Retrying with next key...`);
      lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      console.warn(`[Groq Pool] Key #${currentKeyIndex} timeout/error: ${msg}. Retrying with next key...`);
      lastError = err as Error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`All ${apiKeys.length} Groq API keys exhausted/failed. Last error: ${lastError?.message}`);
}
