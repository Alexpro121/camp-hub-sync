import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, json, SUPABASE_URL, ANON_KEY } from '../_shared/accounts.ts';
import { fetchGroqWithFallback, hasGroqKeys } from '../_shared/groq-pool.ts';

const MODEL = 'llama-3.3-70b-versatile';

/**
 * ГОЛОВНИЙ СИСТЕМНИЙ ПРОМТ ПРОЄКТУ «ЗАЛІЗНА ЗМІНА»
 */
const SYSTEM_PROMPT = `You are an expert schedule parsing assistant for the Ukrainian educational project "Залізна Зміна" (Iron Shift).
Your job is to convert unstructured Ukrainian raw text schedule into a valid, strictly structured JSON object.

======================================================================
STRICT TERMINOLOGY & PROJECT RULES:
======================================================================
1. 🚫 NEVER use the words "табір" or "camp"! Only "Проєкт", "зміна", "команда", "супровід", "учасник".
2. Return ONLY a valid JSON object of the form { "events": [ ... ] }.
   No markdown codeblocks, no explanations, no prefix or suffix.

======================================================================
OUTPUT JSON SCHEMA PER EVENT:
======================================================================
{
  "date": "DD.MM" string or null (e.g. "13.08"),
  "time_start": "HH:MM" string,
  "time_end": "HH:MM" string or null,
  "title": "Clean event title without raw timestamps or team prefix",
  "description": "Optional notes, location, organizers (@...), or secret instructions",
  "target_teams": [number array of team numbers, e.g. [1, 2], or [] if for all teams],
  "category": "fair" | "sports" | "meal" | "gathering" | "entertainment" | "transfer" | "general",
  "has_sub_slots": boolean,
  "sub_slots": [ { "time": "HH:MM", "teams": [1, 2] } ]
}

======================================================================
CATEGORY RULES:
======================================================================
- "fair": ярмарок, маркет, продаж смаколиків, Air Pay.
- "meal": сніданок, обід, вечеря, підвечірок, чай.
- "sports": зарядка, йога, спорт, басейн, тактична медицина, скеледром, руханка.
- "gathering": свічка, розпис футболок, майстер-клас, УАЛ, лекція, воркшоп, рефлексія.
- "entertainment": дискотека, кліпи, вогнище, концерт, виступ, квіз, квест.
- "transfer": потяг, виїзд, трансфер, автобус, прибуття, посадка у вагони.
- "general": підйом, відбій, тихий час, збори, вільний час.

======================================================================
PARSING RULES & SPECIAL PATTERNS:
======================================================================
1. DATE EXTRACTION:
   If text starts with a date header (e.g. "13.08", "13 серпня"), assign "date": "13.08" to all events in that day.

2. STAGGERED MEAL SLOTS (CRITICAL):
   When a main meal event has a general time range (e.g. "09:00-10:00 - сніданок") followed by team shifts:
     "09:00 - 1 та 2 команди
      09:15 - 3 та 4 команди
      09:30 - 5 та 6 команди
      09:35 - 7 та 8 команди"
   -> Emit ONE single event with:
      title: "Сніданок", time_start: "09:00", time_end: "10:00", target_teams: [],
      category: "meal", has_sub_slots: true,
      sub_slots: [
        { "time": "09:00", "teams": [1, 2] },
        { "time": "09:15", "teams": [3, 4] },
        { "time": "09:30", "teams": [5, 6] },
        { "time": "09:35", "teams": [7, 8] }
      ]

3. ROTATION / WORKSHOPS CIRCULAR SYSTEM ("Колова система"):
   When parallel stations are described per team (e.g. "5 команда: 10:30-11:15 розпис футболок, 11:25-12:10 дрони..."):
   -> EXPLODE each activity into its own event with the specific team in target_teams (e.g. target_teams: [5]),
      has_sub_slots: false, sub_slots: [].
   -> Example: "10:30-14:00 - УАЛ (1-4 команди)" -> title: "УАЛ", time_start: "10:30", time_end: "14:00", target_teams: [1, 2, 3, 4], category: "gathering".

4. EVENING ACTIVITIES & TIMELINE CONTINUITY:
   If text lists sequential events with partial times:
     "20:30 - кліпи (Діти мають бути в залі о 20:20)
      Потім у нас ВОГНИЩЕ (Діти мають тепло вдягнутися, паркінг вище готелю. Дискотека + шаурма)
      Після коротка свічка та відбій
      23:30 - відбій"
   -> Emit logical distinct events with realistic time ranges:
      - "Кліпи": 20:30-21:30, description: "Діти мають бути в залі о 20:20", category: "entertainment"
      - "Вогнище та Дискотека": 21:30-22:45, description: "Тепло вдягнутися. Паркінг вище готелю. Сюрприз: шаурма (дітям не говоримо!)", category: "entertainment"
      - "Коротка свічка": 22:45-23:30, category: "gathering"
      - "Відбій": 23:30, time_end: null, category: "general"

5. CLEAN TITLES:
   Remove raw hours, bullet points, and team prefixes from "title". Put extra logistics info into "description".`;

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
  description: z.string().nullable().optional().default(null),
  target_teams: z.array(z.number()).default([]),
  category: z
    .enum(['fair', 'sports', 'meal', 'gathering', 'entertainment', 'transfer', 'general'])
    .default('general'),
  has_sub_slots: z.boolean().default(false),
  sub_slots: z.array(SubSlotSchema).default([]),
});

const ArraySchema = z.array(ItemSchema).min(1);
const BodySchema = z.object({ rawText: z.string().min(1).max(25000) });

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

function extractArray(s: string): string {
  const t = stripFences(s);
  const a = t.indexOf('[');
  const b = t.lastIndexOf(']');
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

/** Відновлює обрізані JSON-рядки та незакриті дужки */
function repairJson(input: string): string {
  let s = stripFences(input);
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

function pickItems(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.events)) return obj.events;
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) return v;
    }
  }
  return parsed;
}

function parseModelJson(content: string): unknown {
  const stripped = stripFences(content);
  const attempts = [stripped, extractArray(content), repairJson(stripped)];
  for (const a of attempts) {
    try {
      return pickItems(JSON.parse(a));
    } catch {
      /* спробувати наступний метод */
    }
  }
  throw new SyntaxError('Model returned unrepairable JSON');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Перевірка авторизації
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

    if (!hasGroqKeys()) {
      return json({ source: 'local_fallback', reason: 'no_api_key', items: [] }, 200);
    }

    try {
      const { data: payload, keyUsedIndex } = await fetchGroqWithFallback(
        {
          model: MODEL,
          temperature: 0.1,
          max_tokens: 8192,
          stream: false,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: rawText },
          ],
        },
        22000
      );

      console.log(`[parse-schedule-ai] served by Groq key #${keyUsedIndex}`);
      const content: string = payload?.choices?.[0]?.message?.content ?? '';
      let candidate: unknown;

      try {
        candidate = parseModelJson(content);
      } catch (e) {
        console.error('Failed to parse Groq response, fallback to regex:', e);
        return json(
          {
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
          },
          200
        );
      }

      const validated = ArraySchema.safeParse(candidate);
      if (!validated.success) {
        return json(
          {
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
          },
          200
        );
      }

      const items = validated.data.map((it) => ({
        date: it.date ?? null,
        time_start: it.time_start ?? null,
        time_end: it.time_end ?? null,
        title: it.title.trim(),
        description: it.description ? it.description.trim() : null,
        target_teams: Array.from(new Set(it.target_teams.filter((n) => Number.isFinite(n) && n > 0 && n < 100))),
        category: it.category,
        has_sub_slots: Boolean(it.has_sub_slots && it.sub_slots.length > 0),
        sub_slots: it.sub_slots.map((s) => ({
          time: s.time,
          teams: Array.from(new Set(s.teams.filter((n) => Number.isFinite(n) && n > 0 && n < 100))),
        })),
      }));

      return json({ source: 'ai', items }, 200);
    } catch (e) {
      return json(
        {
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
        },
        200
      );
    }
  } catch (e) {
    return json(
      {
        source: 'fallback',
        reason: 'unexpected',
        items: [],
        error: {
          code: 'UNEXPECTED',
          status: 500,
          model: MODEL,
          message: (e as Error)?.message ?? 'unexpected',
          raw: '',
        },
      },
      200
    );
  }
});
