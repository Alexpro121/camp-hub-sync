import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { parseApiKeys, providerMessage, requestScheduleWithKeys } from './gemini.ts';
import { logScheduleDiagnostic, monitorScheduleStream } from './monitor.ts';

const bodySchema = z.object({
  rawText: z.string().trim().min(1).max(25000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
});
const json = (error: string, status: number) => new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json('Метод не підтримується', 405);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json('Увійдіть як адміністратор', 401);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return json('Сервіс генерації не налаштований', 500);
  const requestId = crypto.randomUUID();
  // Крок, на якому впала функція, — у лог і в повідомлення (без тексту розкладу й ключів).
  let stage: 'auth' | 'roles' | 'body' | 'provider' = 'auth';
  try {
    const client = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data, error } = await client.auth.getUser(auth.slice(7));
    if (error || !data.user) return json('Увійдіть як адміністратор', 401);
    stage = 'roles';
    const roles = await client.from('user_roles').select('role').eq('user_id', data.user.id).eq('role', 'admin').limit(1);
    if (roles.error || !roles.data?.length) return json('Генерація доступна лише адміністратору', 403);
    stage = 'body';
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json('Вкажіть текст до 25 000 символів і коректну дату', 400);
    // Один або кілька ключів через кому; приймаємо обидві назви секрету.
    const rawKey = [Deno.env.get('GEMINI_API_KEYS'), Deno.env.get('GEMINI_API_KEY')].filter(Boolean).join(',');
    if (!rawKey?.trim()) return json('Додайте ключ Google AI Studio для генерації', 503);
    const { keys, rejected } = parseApiKeys(rawKey);
    if (rejected) logScheduleDiagnostic({ requestId, stage: 'config', reason: `INVALID_API_KEY_FORMAT:${rejected}` });
    if (!keys.length) {
      return json('Ключ Gemini (GEMINI_API_KEY) збережено з недопустимими символами. Скопіюйте ключі з Google AI Studio заново; кілька ключів — через кому, без лапок і пробілів.', 503);
    }
    stage = 'provider';
    // Ключі по черзі: недійсний, без доступу чи з вичерпаною квотою — пробуємо наступний.
    const { response, keyIndex } = await requestScheduleWithKeys(keys, parsed.data.rawText, parsed.data.date, req.signal, fetch,
      (skip) => logScheduleDiagnostic({ requestId, stage: 'key_rotate', code: skip.code, reason: `key#${skip.keyIndex}${skip.reason ? `:${skip.reason}` : ''}` }));
    if (!response.ok) {
      logScheduleDiagnostic({ requestId, stage: 'http', code: response.status, reason: `key#${keyIndex}/${keys.length}` });
      await response.body?.cancel();
      const failure = json(providerMessage(response.status), response.status);
      failure.headers.set('x-schedule-request-id', requestId);
      failure.headers.set('Access-Control-Expose-Headers', 'x-schedule-request-id');
      return failure;
    }
    if (!response.body) return json('Gemini повернув порожню відповідь', 502);
    return new Response(monitorScheduleStream(response.body, requestId), { headers: {
      ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'x-schedule-request-id': requestId, 'Access-Control-Expose-Headers': 'x-schedule-request-id',
    } });
  } catch (error) {
    if (req.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return json('Генерацію зупинено', 499);
    // Лише назва помилки й крок: повідомлення може містити дані запиту.
    logScheduleDiagnostic({ requestId, stage: `exception:${stage}`, reason: error instanceof Error ? error.name.slice(0, 40) : 'unknown' });
    const message = stage === 'provider'
      ? 'Не вдалося з’єднатися з Google Gemini (мережа або ключ). Нічого не збережено.'
      : `Внутрішня помилка генерації (крок: ${stage}). Нічого не збережено.`;
    const failure = json(message, 502);
    failure.headers.set('x-schedule-request-id', requestId);
    failure.headers.set('Access-Control-Expose-Headers', 'x-schedule-request-id');
    return failure;
  }
});