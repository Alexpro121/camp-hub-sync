import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, json, SUPABASE_URL, ANON_KEY } from '../_shared/accounts.ts';
import { fetchGroqWithFallback, hasGroqKeys } from '../_shared/groq-pool.ts';

const MODEL = 'groq/compound';

const SYSTEM_PROMPT = `You are an expert schedule parsing assistant for a Ukrainian youth camp.
Your job is to convert unstructured Ukrainian raw text schedule into valid JSON.

OUTPUT FORMAT REQUIREMENTS:
- Return ONLY a valid JSON object of the form { "events": [ ... ] }.
  No markdown blocks, no code fences, no introductory text, no comments.
- Structure of each event object in the array:
  {
    "date": "DD.MM" string or null if not present in text,
    "time_start": "HH:MM" string,
    "time_end": "HH:MM" string or null,
    "title": "Clean event title without team numbers or time",
    "target_teams": [number array of team numbers, e.g., [1, 2], or empty array [] if for all teams],
    "category": "fair" | "sports" | "meal" | "gathering" | "entertainment" | "transfer" | "general",
    "has_sub_slots": boolean,
    "sub_slots": [ { "time": "HH:MM", "teams": [1, 2] } ]
  }

CATEGORY RULES (Allowed: "fair" | "meal" | "sports" | "gathering" | "entertainment" | "transfer" | "general"):
1. If title/description mentions 'ярмарок', 'ярмарка', 'маркет', 'продаж смаколиків' -> category MUST BE 'fair'.
2. If title mentions 'сніданок', 'обід', 'вечеря', 'чай' -> category MUST BE 'meal'.
3. If title mentions 'зарядка', 'йога', 'спорт', 'бассейн', 'басейн', 'тактична медицина' -> category MUST BE 'sports'.
4. If title mentions 'свічка', 'сінемалогія', 'концерт', 'акторська майстерність', 'розпис футболок' -> category MUST BE 'gathering'.
5. If title mentions 'виїзд', 'буковель', 'потяг', 'трансфер' -> category MUST BE 'transfer'.

CIRCULAR SYSTEM RULES (Колова система):
For parallel workshop blocks like 'колова система': group them concisely into logical time slots.
Assign specific team numbers to 'target_teams' if specified for that sub-event.

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
  category: z.enum(['fair', 'sports', 'meal', 'gathering', 'entertainment', 'transfer', 'general']).default('general'),
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

/** Repairs truncated model output: closes dangling strings/brackets and drops the incomplete tail. */
function repairJson(input: string): string {
  let s = stripFences(input);
  // Drop a trailing incomplete token (e.g. `"tim` or `, {"time":`)
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      stack.pop();
      lastSafe = i;
    }
  }
  if (inStr) {
    s = lastSafe >= 0 ? s.slice(0, lastSafe + 1) : s + '"';
  } else if (lastSafe >= 0 && lastSafe < s.length - 1) {
    s = s.slice(0, lastSafe + 1);
  }
  // Recompute open brackets after truncation
  const open: string[] = [];
  let str = false, e2 = false;
  for (const c of s) {
    if (str) {
      if (e2) e2 = false;
      else if (c === '\\') e2 = true;
      else if (c === '"') str = false;
      continue;
    }
    if (c === '"') str = true;
    else if (c === '{') open.push('}');
    else if (c === '[') open.push(']');
    else if (c === '}' || c === ']') open.pop();
  }
  s = s.replace(/,\s*$/, '');
  while (open.length) s += open.pop();
  return s;
}

/** Accepts a bare array, `{ events: [...] }`, or any object holding the first array value. */
function pickItems(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.events)) return obj.events;
    for (const v of Object.values(obj)) if (Array.isArray(v)) return v;
  }
  return parsed;
}

function parseModelJson(content: string): unknown {
  const stripped = stripFences(content);
  const attempts = [stripped, extractArray(content), repairJson(stripped)];
  for (const a of attempts) {
    try {
      return pickItems(JSON.parse(a));
    } catch { /* try next */ }
  }
  throw new SyntaxError('Model returned unrepairable JSON');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth is required for AI usage, but a missing/expired session must NOT blow up the UI:
    // answer 200 with a local_fallback marker so the client parses the schedule offline.
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    let authorized = false;
    if (token && token !== ANON_KEY) {
      const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { data: userRes } = await pub.auth.getUser(token);
      authorized = Boolean(userRes?.user);
    }
    if (!authorized) {
      return json({ source: 'local_fallback', reason: 'unauthorized', items: [] }, 200);
    }

    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) return json({ error: 'invalid_body' }, 400);
    const { rawText } = parsedBody.data;

    if (!hasGroqKeys()) return json({ source: 'local_fallback', reason: 'no_api_key', items: [] }, 200);

    try {
      const { data: payload, keyUsedIndex } = await fetchGroqWithFallback({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 8192,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawText },
        ],
      }, 20000);
      console.log(`[parse-schedule-ai] served by key #${keyUsedIndex}`);
      const content: string = payload?.choices?.[0]?.message?.content ?? '';
      let candidate: unknown;
      try {
        candidate = parseModelJson(content);
      } catch (e) {
        console.error('Failed to parse Groq response, falling back to local regex:', e);
        return json({
          source: 'local_fallback',
          reason: 'json_syntax_repaired',
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
      // Whole key pool exhausted → silent switch to the local Smart Regex parser.
      return json({
        source: 'local_fallback',
        reason: 'pool_exhausted',
        items: [],
        error: {
          code: 'GROQ_POOL_EXHAUSTED',
          status: 0,
          model: MODEL,
          message: (e as Error)?.message ?? 'All Groq keys failed',
          raw: '',
        },
      }, 200);
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
