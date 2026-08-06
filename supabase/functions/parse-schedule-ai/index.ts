import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, json, SUPABASE_URL, ANON_KEY } from '../_shared/accounts.ts';

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'mistralai/mistral-medium-3.5-128b';

const SYSTEM_PROMPT = `You are an expert schedule parsing assistant for a Ukrainian youth camp.
Your job is to convert unstructured Ukrainian raw text schedule into a valid JSON array of event objects.

OUTPUT FORMAT REQUIREMENTS:
- Return ONLY a valid JSON array. No markdown blocks, no code fences, no introductory text, no comments.
- Structure of each event object in the array:
  {
    "date": "DD.MM" string or null if not present in text,
    "time_start": "HH:MM" string,
    "time_end": "HH:MM" string or null,
    "title": "Clean event title without team numbers or time",
    "target_teams": [number array of team numbers, e.g., [1, 2], or empty array [] if for all teams],
    "category": "sports" | "meal" | "gathering" | "entertainment" | "transfer" | "general"
  }

PARSING RULES:
1. If a line specifies teams like "1 і 2 команда" or "3, 4 та 5 команди", parse them into target_teams: [1, 2].
2. If no teams are mentioned for a time slot, target_teams MUST be [] (means event is for ALL teams).
3. If time range is given like "09:00-10:00", time_start = "09:00", time_end = "10:00".
4. If single time is given like "07:45", time_start = "07:45", time_end = null.
5. Clean the title: remove times, remove team prefixes, summarize concisely in Ukrainian.`;

const TIME = /^\d{1,2}:\d{2}$/;
const ItemSchema = z.object({
  date: z.string().nullable().optional(),
  time_start: z.string().regex(TIME).nullable().optional(),
  time_end: z.string().regex(TIME).nullable().optional(),
  title: z.string().min(1),
  target_teams: z.array(z.number()).default([]),
  category: z.enum(['sports', 'meal', 'gathering', 'entertainment', 'transfer', 'general']).default('general'),
});
const ArraySchema = z.array(ItemSchema).min(1);

const BodySchema = z.object({ rawText: z.string().min(1).max(20000) });

function stripFences(s: string) {
  return s.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

function extractArray(s: string) {
  const t = stripFences(s);
  const a = t.indexOf('[');
  const b = t.lastIndexOf(']');
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'unauthorized' }, 401);
    const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: userRes } = await pub.auth.getUser(token);
    if (!userRes?.user) return json({ error: 'unauthorized' }, 401);

    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) return json({ error: 'invalid_body' }, 400);
    const { rawText } = parsedBody.data;

    const key = Deno.env.get('NVIDIA_API_KEY');
    if (!key) return json({ source: 'fallback', reason: 'no_api_key', items: [] }, 200);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(NVIDIA_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.1,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: rawText },
          ],
        }),
      });
      if (!res.ok) {
        await res.text();
        return json({ source: 'fallback', reason: `nvidia_${res.status}`, items: [] }, 200);
      }
      const payload = await res.json();
      const content: string = payload?.choices?.[0]?.message?.content ?? '';
      let candidate: unknown;
      try {
        candidate = JSON.parse(extractArray(content));
      } catch {
        return json({ source: 'fallback', reason: 'invalid_json', items: [] }, 200);
      }
      const validated = ArraySchema.safeParse(candidate);
      if (!validated.success) return json({ source: 'fallback', reason: 'schema_mismatch', items: [] }, 200);

      const items = validated.data.map((it) => ({
        date: it.date ?? null,
        time_start: it.time_start ?? null,
        time_end: it.time_end ?? null,
        title: it.title.trim(),
        target_teams: it.target_teams.filter((n) => Number.isFinite(n) && n > 0 && n < 100),
        category: it.category,
      }));
      return json({ source: 'ai', items }, 200);
    } catch (e) {
      const reason = (e as Error)?.name === 'AbortError' ? 'timeout' : 'network_error';
      return json({ source: 'fallback', reason, items: [] }, 200);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return json({ source: 'fallback', reason: 'unexpected', items: [] }, 200);
  }
});
