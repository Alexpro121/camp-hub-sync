import { corsHeaders, requireUser } from '../_shared/accounts.ts';
import { fetchGroqWithFallback, hasGroqKeys } from '../_shared/groq-pool.ts';

const MODEL = 'llama-3.3-70b-versatile';

/**
 * СУПЕР-ПРОМТ: Інтелектуальний парсер розкладу проєкту «Залізна Зміна»
 */
const SYSTEM_PROMPT = `You are the Lead Schedule Architect AI for the Ukrainian educational project "Залізна Зміна" (Iron Shift).
Your task is to parse raw, messy, human-written schedule text into a strictly formatted, chronologically consistent JSON schedule.

======================================================================
STRICT BUSINESS & PARSING RULES:
======================================================================
1. 🚫 FORBIDDEN WORDS: NEVER use the word "табір" or "camp"! Use "Проєкт", "зміна", "команда", "супровід".
2. 📅 DATE EXTRACTION:
   - Extract the date from headers like "13.08", "13 серпня", "13.08.2026".
   - Normalize "date" to ISO format "YYYY-MM-DD" (use current year 2026, e.g. "2026-08-13").
   - Also keep "raw_date" (e.g. "13.08").
3. 👥 TARGET TEAMS PARSING (target_teams array of integers):
   - If an event is for everyone (e.g. "Підйом", "Зарядка", "Відбій", "Кліпи", "Вогнище") -> "target_teams": [] (empty array means all teams).
   - "1 та 2 команди" or "1-2 команди" -> [1, 2]
   - "УАЛ (1-4 команди)" -> [1, 2, 3, 4]
   - Under a header like "5 команда" -> all nested workshop rows get [5].
4. 🔄 ROTATION / WORKSHOP CIRCULAR SYSTEM ("Колова система"):
   - When text lists parallel workshop slots for specific teams (e.g. 5, 6, 7, 8 команди with slots like 10:30-11:15, 11:25-12:10), EXPLODE every single item into its own distinct schedule entry with the corresponding team in target_teams.
   - Example: Team 5 "10:30-11:15 - розпис футболок" -> title: "Розпис футболок", start_time: "10:30", end_time: "11:15", target_teams: [5].
5. 🍽️ STAGGERED MEAL TIMES (Сніданок / Обід / Вечеря):
   - Parse each staggered team breakfast/lunch/dinner slot as a distinct schedule event with its specific time and target_teams.
   - Example: "09:00 - 1 та 2 команди" under "Сніданок" -> title: "Сніданок (1-2 команди)", start_time: "09:00", end_time: "09:15", target_teams: [1, 2], category: "meal".
6. 📍 LOCATIONS & ORGANIZERS:
   - Detect locations in parentheses or text (e.g. "(велика зала)" -> location: "Велика зала", "паркінг вище готелю" -> location: "Паркінг вище готелю").
   - Extract instructors/hosts/tags (e.g. "Проводять: @babyakeva @lkaphs...") into "organizers".
7. 📝 NOTES, LOGISTICS & SECRET ACTIVITIES:
   - Extract instructions for supervisors (e.g. "Діти мають бути в залі о 20:20", "тепло вдягнутися, один супровід веде, інший замикає") into "notes".
   - Extract secret notes (e.g. "дискотека + шаурма (дітям не говоримо!!!!)") into "notes".
8. ⏰ TIME INFERENCE:
   - Always ensure HH:MM format (e.g. "08:00", "09:30").
   - If end_time is missing (e.g. "08:00 - підйом", next is "08:30 - зарядка"), infer end_time = "08:30".
   - If an event is sequential (e.g. "20:30 - кліпи", followed by "Потім у нас ВОГНИЩЕ", "Після коротка свічка", "23:30 - відбій"), infer logical realistic start/end times (e.g. Кліпи: 20:30-21:30, Вогнище: 21:30-22:45, Коротка свічка: 22:45-23:30, Відбій: 23:30-08:00).
9. 🏷️ CATEGORY ENUM:
   - "routine" (підйом, відбій, збори)
   - "meal" (сніданок, обід, вечеря, підвечірок)
   - "workshop" (дрони, розпис футболок, тактична медицина, УАЛ, лекція)
   - "activity" (зарядка, спорт, квест, басейн)
   - "event" (вечірній захід, кліпи, вогнище, концерт, дискотека, свічка)

======================================================================
JSON OUTPUT FORMAT:
======================================================================
{
  "date": "2026-08-13",
  "raw_date": "13.08",
  "total_events": 25,
  "events": [
    {
      "title": "Підйом",
      "start_time": "08:00",
      "end_time": "08:30",
      "target_teams": [],
      "location": null,
      "organizers": null,
      "notes": null,
      "category": "routine"
    },
    {
      "title": "Зарядка",
      "start_time": "08:30",
      "end_time": "09:00",
      "target_teams": [],
      "location": "Велика зала",
      "organizers": "@babyakeva, @lkaphs, @butko7, @wr40a",
      "notes": null,
      "category": "activity"
    },
    {
      "title": "Сніданок (1-2 команди)",
      "start_time": "09:00",
      "end_time": "09:15",
      "target_teams": [1, 2],
      "location": "Їдальня",
      "organizers": null,
      "notes": null,
      "category": "meal"
    },
    {
      "title": "Розпис футболок",
      "start_time": "10:30",
      "end_time": "11:15",
      "target_teams": [5],
      "location": null,
      "organizers": null,
      "notes": "Колова система",
      "category": "workshop"
    },
    {
      "title": "Кліпи",
      "start_time": "20:30",
      "end_time": "21:30",
      "target_teams": [],
      "location": "Актова зала",
      "organizers": null,
      "notes": "Діти мають бути в залі о 20:20",
      "category": "event"
    },
    {
      "title": "Вогнище та Дискотека",
      "start_time": "21:30",
      "end_time": "22:45",
      "target_teams": [],
      "location": "Паркінг вище готелю",
      "organizers": null,
      "notes": "Діти мають тепло вдягнутися. Ведемо однією колоною: один супровід веде, інший замикає. Сюрприз: шаурма (дітям не говоримо!)",
      "category": "event"
    },
    {
      "title": "Коротка свічка",
      "start_time": "22:45",
      "end_time": "23:30",
      "target_teams": [],
      "location": null,
      "organizers": null,
      "notes": "Підсумки дня з командою",
      "category": "routine"
    },
    {
      "title": "Відбій",
      "start_time": "23:30",
      "end_time": "08:00",
      "target_teams": [],
      "location": null,
      "organizers": null,
      "notes": "Тиша в корпусах",
      "category": "routine"
    }
  ]
}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (auth.response) return auth.response;

    const { text = '', defaultDate = null } = await req.json();
    const cleanText = String(text || '').trim();

    if (!cleanText) {
      return json({ error: 'EMPTY_TEXT', events: [] }, 400);
    }

    if (!hasGroqKeys()) {
      return json({ error: 'NO_GROQ_KEY', source: 'local_fallback', events: [] }, 200);
    }

    try {
      const { data, keyUsedIndex } = await fetchGroqWithFallback({
        model: MODEL,
        temperature: 0.1, // Низька температура для суворої точності фактів
        max_tokens: 4500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `DEFAULT DATE CONTEXT (if missing): ${defaultDate ?? '2026-08-13'}\n\nRAW SCHEDULE TEXT TO PARSE:\n${cleanText.slice(0, 16000)}`,
          },
        ],
      });

      console.log(`[parse-schedule-ai] successfully processed via Groq key #${keyUsedIndex}`);

      const content = data?.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(String(content).replace(/```json|```/g, '').trim());

      const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];

      // Додаткова пост-валідація та санітизація
      const validatedEvents = rawEvents
        .map((ev: any, index: number) => {
          const title = String(ev.title || '').trim();
          if (!title) return null;

          const startTime = String(ev.start_time || '08:00').trim().slice(0, 5);
          const endTime = String(ev.end_time || startTime).trim().slice(0, 5);

          let teams: number[] = [];
          if (Array.isArray(ev.target_teams)) {
            teams = ev.target_teams
              .map((t: any) => parseInt(String(t), 10))
              .filter((n: number) => !isNaN(n) && n > 0 && n <= 30);
          }

          return {
            id: `gen-${index + 1}-${Date.now()}`,
            title,
            start_time: startTime,
            end_time: endTime,
            target_teams: Array.from(new Set(teams)), // deduplicate
            location: ev.location ? String(ev.location).trim() : null,
            organizers: ev.organizers ? String(ev.organizers).trim() : null,
            notes: ev.notes ? String(ev.notes).trim() : null,
            category: ['routine', 'meal', 'workshop', 'activity', 'event'].includes(ev.category)
              ? ev.category
              : 'activity',
          };
        })
        .filter(Boolean);

      return json({
        date: parsed.date || defaultDate || '2026-08-13',
        raw_date: parsed.raw_date || '',
        total_events: validatedEvents.length,
        events: validatedEvents,
        source: 'ai-groq-llama-3.3-70b',
      });
    } catch (groqError) {
      const msg = String((groqError as Error).message || groqError);
      console.error('[parse-schedule-ai] Groq error:', msg);
      return json({ error: 'AI_PARSING_FAILED', message: msg, events: [] }, 500);
    }
  } catch (e) {
    return json({ error: 'BAD_REQUEST', message: String((e as Error).message || e), events: [] }, 400);
  }
});
