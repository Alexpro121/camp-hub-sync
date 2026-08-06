import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, json, SUPABASE_URL, ANON_KEY } from '../_shared/accounts.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

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
    "category": "sports" | "meal" | "gathering" | "entertainment" | "transfer" | "general",
    "has_sub_slots": boolean,
    "sub_slots": [ { "time": "HH:MM", "teams": [1, 2] } ]
  }

PARSING RULES:
1. If a line specifies teams like "1 і 2 команда" or "3, 4 та 5 команди", parse them into target_teams: [1, 2].
2. If no teams are mentioned for a time slot, target_teams MUST be [] (means event is for ALL teams).
3. If time range is given like "09:00-10:00", time_start = "09:00", time_end = "10:00".
4. If single time is given like "07:45", time_start = "07:45", time_end = null.
5. Clean the title: remove times, remove team prefixes, summarize concisely in Ukrainian.

STAGGERED EVENTS (CRITICAL):
6. Camp schedules often list a general event (сніданок, обід, вечеря, полуденок, ярмарок, душ) with a time RANGE,
   followed by lines that contain ONLY a time and team numbers, e.g.:
     "16:30-17:30 - вечеря
      16:30 - 1 і 2 команда
      16:45 - 3 і 4 команда
      17:00 - 5 і 6 команда"
   These following lines are NOT separate events. They are staggered slots INSIDE the main event.
7. In that case emit ONE event object for the main event with:
   has_sub_slots: true, target_teams: [], time_start/time_end covering the whole range,
   and sub_slots: [{ "time": "16:30", "teams": [1,2] }, { "time": "16:45", "teams": [3,4] }, ...].
8. Ordinary events without staggered team lines MUST have has_sub_slots: false and sub_slots: [].
9. A line that has its own meaningful activity name (e.g. "9:00 - 1 і 2 команда - скеледром") is a NORMAL
   separate event with target_teams: [1,2], NOT a sub_slot.`;

const TIME = /^\d{1,2}:\d{2}$/;
const SubSlotSchema = z.object({
  time: z.string().regex(TIME),
  teams: z.array(z.number()).default([]),
});
const ItemSchema = z.object({
  date: z.string().nullable().optional(),
  time_start: z.string().regex(TIME).nullable().optional(),
  time_end: z.string().regex(TIME).nullable().optional(),
  title: z.string().min(1),
  target_teams: z.array(z.number()).default([]),
  category: z.enum(['sports', 'meal', 'gathering', 'entertainment', 'transfer', 'general']).default('general'),
  has_sub_slots: z.boolean().default(false),
  sub_slots: z.array(SubSlotSchema).default([]),
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

    const key = Deno.env.get('GROQ_API_KEY');
    if (!key) return json({ source: 'fallback', reason: 'no_api_key', items: [] }, 200);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.1,
          max_tokens: 2048,
          stream: false,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: rawText },
          ],
        }),
      });
      if (!res.ok) {
        const bodyText = await res.text();
        let providerMessage = '';
        try { providerMessage = JSON.parse(bodyText)?.error?.message ?? JSON.parse(bodyText)?.detail ?? ''; } catch { /* raw */ }
        return json({
          source: 'fallback',
          reason: `groq_${res.status}`,
          items: [],
          error: {
            code: `GROQ_HTTP_${res.status}`,
            status: res.status,
            model: MODEL,
            message: providerMessage || res.statusText || 'Groq API error',
            raw: bodyText.slice(0, 300),
          },
        }, 200);
      }
      const payload = await res.json();
      const content: string = payload?.choices?.[0]?.message?.content ?? '';
      let candidate: unknown;
      try {
        candidate = JSON.parse(extractArray(content));
      } catch (e) {
        return json({
          source: 'fallback',
          reason: 'invalid_json',
          items: [],
          error: {
            code: 'JSON_SYNTAX_ERROR',
            status: 200,
            model: MODEL,
            message: (e as Error)?.message ?? 'Model returned non-JSON output',
            raw: content.slice(0, 300),
          },
        }, 200);
      }
      const validated = ArraySchema.safeParse(candidate);
      if (!validated.success) {
        return json({
          source: 'fallback',
          reason: 'schema_mismatch',
          items: [],
          error: {
            code: 'SCHEMA_MISMATCH',
            status: 200,
            model: MODEL,
            message: JSON.stringify(validated.error.issues.slice(0, 5)).slice(0, 300),
            raw: content.slice(0, 300),
          },
        }, 200);
      }

      const items = validated.data.map((it) => ({
        date: it.date ?? null,
        time_start: it.time_start ?? null,
        time_end: it.time_end ?? null,
        title: it.title.trim(),
        target_teams: it.target_teams.filter((n) => Number.isFinite(n) && n > 0 && n < 100),
        category: it.category,
        has_sub_slots: it.has_sub_slots && it.sub_slots.length > 0,
        sub_slots: it.sub_slots.map((s) => ({
          time: s.time,
          teams: s.teams.filter((n) => Number.isFinite(n) && n > 0 && n < 100),
        })),
      }));
      return json({ source: 'ai', items }, 200);
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      return json({
        source: 'fallback',
        reason: aborted ? 'timeout' : 'network_error',
        items: [],
        error: {
          code: aborted ? 'TIMEOUT_8S' : 'NETWORK_ERROR',
          status: 0,
          model: MODEL,
          message: (e as Error)?.message ?? 'Unknown network error',
          raw: '',
        },
      }, 200);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return json({
      source: 'fallback',
      reason: 'unexpected',
      items: [],
      error: { code: 'UNEXPECTED', status: 500, model: MODEL, message: (e as Error)?.message ?? 'unexpected', raw: '' },
    }, 200);
  }
});
