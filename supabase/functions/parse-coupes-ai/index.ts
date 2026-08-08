import { corsHeaders } from '../_shared/accounts.ts';
import { fetchGroqWithFallback, hasGroqKeys } from '../_shared/groq-pool.ts';

const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are a Ukrainian train seating parsing assistant for a youth camp.
Your job is to parse train seat allocations into a JSON array of passengers.
STRICT RULES:
1. IGNORE HEADER LINES that do not have explicit seat numbers (e.g. "Команда 5", "МАН + Сайт", "Валера, Валерія..."). DO NOT put header metadata into Coupe #1!
2. ONLY parse lines with explicit seat numbers 1 to 40.
3. Ignore empty seats marked as ".", "..", "SS".
4. If a line contains a city suffix (e.g., "12. Кундик Сергій - Львів" or "24. Васильченко Лілія – Івано-Франківськ"):
   - Set "name" = "Кундик Сергій"
   - Set "boarding_city" = "Львів"
   - DO NOT create a second passenger named "Львів"!
5. Map coupe_number = Math.ceil(seat_number / 4).
6. NEVER rename, translate, correct or invent people. Copy names byte-for-byte.
7. "Команда N" lines set team_number for the rows that follow.
8. If line format is 'Name - TeamNumber команда' (e.g. 'артем - 5 моанада'), extract name='Артем', team_number=5, ignoring human typos like 'моанада', 'комнада', 'моанда'. In that case there are no explicit seat numbers: assign seat_number sequentially from 1 upward SEPARATELY for each team_number (max 40), and coupe_number = ceil(seat_number/4). Capitalize the first letter of each name word, keep the spelling otherwise.
OUTPUT FORMAT (JSON Object):
{"team_number":6,"passengers":[{"seat_number":5,"coupe_number":2,"name":"Могилка Анастасія Павлівна","boarding_city":null,"team_number":6},{"seat_number":12,"coupe_number":3,"name":"Кундик Сергій","boarding_city":"Львів","team_number":6}]}`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { text = '', team = null } = await req.json();
    if (!String(text).trim()) return json({ error: 'EMPTY', passengers: [] }, 400);

    if (!hasGroqKeys()) return json({ error: 'NO_KEY', source: 'local_fallback', passengers: [] }, 200);

    try {
      const { data, keyUsedIndex } = await fetchGroqWithFallback({
        model: MODEL,
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `DEFAULT TEAM: ${team ?? 'unknown'}\n\n${String(text).slice(0, 12000)}` },
        ],
      });
      console.log(`[parse-coupes-ai] served by key #${keyUsedIndex}`);
      const content = data?.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(String(content).replace(/```json|```/g, '').trim());
      const list = Array.isArray(parsed.passengers) ? parsed.passengers : [];
      const passengers = list
        .map((p: any) => {
          const seat = Number(p.seat_number);
          if (!(seat >= 1 && seat <= 40)) return null;
          const name = String(p.name ?? '').trim();
          if (!seat || !name) return null;
          return {
            seat_number: seat,
            name,
            boarding_city: p.boarding_city ? String(p.boarding_city).trim() : null,
            coupe_number: Math.ceil(seat / 4),
            team_number: Number(p.team_number ?? parsed.team_number ?? team ?? 0) || 0,
          };
        })
        .filter(Boolean);
      return json({ passengers, source: 'ai' });
    } catch (e) {
      const msg = String((e as Error).message || e);
      // All keys exhausted → client silently runs its local Smart Regex parser.
      return json({ error: 'GROQ_POOL_EXHAUSTED', source: 'local_fallback', message: msg, passengers: [] }, 200);
    }
  } catch (e) {
    return json({ error: 'BAD_REQUEST', message: String((e as Error).message || e), passengers: [] }, 400);
  }
});