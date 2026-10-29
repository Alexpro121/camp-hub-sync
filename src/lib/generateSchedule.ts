import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';

const chunkSchema = z.object({
  error: z.object({ message: z.string().optional(), code: z.number().optional(), status: z.string().optional() }).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    finishMessage: z.string().optional(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).optional() }).optional(),
  })).optional(),
});

function providerError(code?: number, status?: string): string {
  const detail = [code, status].filter(Boolean).join(' · ');
  const reason = code === 503 ? 'Gemini перевантажений. Спробуйте пізніше.'
    : code === 429 ? 'Перевищено ліміт запитів або квоту Gemini. Спробуйте пізніше.'
    : code === 401 || code === 403 ? 'Google відхилив доступ до Gemini. Потрібно перевірити доступ у Google AI Studio.'
    : code === 400 ? 'Google відхилив формат запиту до Gemini.'
    : code === 404 ? 'Обрана модель Gemini недоступна.'
    : 'Google Gemini повернув помилку під час генерації.';
  return `${reason}${detail ? ` (${detail})` : ''} Неповний розклад не збережено.`;
}

export async function readScheduleStream(response: Response, signal: AbortSignal, onText: (text: string) => void): Promise<string> {
  const requestId = response.headers.get('x-schedule-request-id');
  const diagnostic = (message: string) => new Error(`${message}${requestId ? ` Код звернення: ${requestId}` : ''}`);
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const parsed = z.object({ error: z.string() }).safeParse(data);
    throw diagnostic(`${parsed.success ? parsed.data.error : 'Не вдалося згенерувати розклад'} (HTTP ${response.status})`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Порожня відповідь Gemini');
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let complete = false;
  const consume = (event: string) => {
    const payload = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
    if (!payload || payload === '[DONE]') return;
    let value: unknown;
    try { value = JSON.parse(payload); } catch { throw diagnostic('Некоректна відповідь Gemini (INVALID_STREAM_JSON). Нічого не збережено.'); }
    const validation = chunkSchema.safeParse(value);
    if (!validation.success) throw diagnostic('Невідомий формат відповіді Gemini (INVALID_STREAM_FORMAT). Нічого не збережено.');
    const chunk = validation.data;
    if (chunk.error) throw diagnostic(providerError(chunk.error.code, chunk.error.status));
    if (chunk.promptFeedback?.blockReason) throw diagnostic(`Gemini відхилив запит (${chunk.promptFeedback.blockReason}). Генерація зупинена.`);
    const candidate = chunk.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw diagnostic(`Gemini не завершив розклад (${candidate.finishReason}). Неповний результат не можна зберегти.`);
    for (const part of candidate?.content?.parts ?? []) if (part.text && !part.thought) text += part.text;
    if (text.length > 1_000_000) throw new Error('Результат завеликий');
    onText(text);
    if (candidate?.finishReason === 'STOP') complete = true;
  };
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Генерацію зупинено', 'AbortError');
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n');
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (signal.aborted) throw new DOMException('Генерацію зупинено', 'AbortError');
    if (!complete || !text.trim()) throw diagnostic('Неповна відповідь Gemini (INCOMPLETE_STREAM). Нічого не збережено.');
    return text;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function generateSchedule(rawText: string, date: string, signal: AbortSignal, onText: (text: string) => void) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Увійдіть як адміністратор');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-schedule`, {
    method: 'POST', headers: {
      'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${data.session.access_token}`,
    }, body: JSON.stringify({ rawText, date }), signal,
  });
  return readScheduleStream(response, signal, onText);
}