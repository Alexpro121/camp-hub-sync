import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { providerMessage, requestSchedule } from './gemini.ts';

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
  try {
    const client = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data, error } = await client.auth.getUser(auth.slice(7));
    if (error || !data.user) return json('Увійдіть як адміністратор', 401);
    const roles = await client.from('user_roles').select('role').eq('user_id', data.user.id).eq('role', 'admin').limit(1);
    if (roles.error || !roles.data?.length) return json('Генерація доступна лише адміністратору', 403);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json('Вкажіть текст до 25 000 символів і коректну дату', 400);
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json('Додайте ключ Google AI Studio для генерації', 503);
    const response = await requestSchedule(key, parsed.data.rawText, parsed.data.date, req.signal);
    if (!response.ok) {
      await response.body?.cancel();
      return json(providerMessage(response.status), response.status);
    }
    if (!response.body) return json('Gemini повернув порожню відповідь', 502);
    return new Response(response.body, { headers: {
      ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    } });
  } catch (error) {
    if (req.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return json('Генерацію зупинено', 499);
    return json('Не вдалося зв’язатися з Gemini. Нічого не збережено.', 502);
  }
});