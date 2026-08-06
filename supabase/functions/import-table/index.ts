import { corsHeaders } from '../_shared/accounts.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are a Ukrainian data parsing engine. Map messy CSV/Excel headers to standard database keys:
- "is_present": boolean (Presence, Навність, Наявність, Присутність, TRUE/FALSE)
- "row_number": integer (№, Номер, № п/п)
- "team_number": integer (№ Команди, Номер команди, Загін)
- "full_name": string (ПІП дитини, ПІБ дитини, ПІБ, ФИО, Ім'я)
- "phone": string (Номер телефону дитини, Телефон, Мобільний)
- "team_name": string (Команда, Назва команди)
- "note_from_table": string (Примітка, Примітки, Місто, Нотатка)

Return ONLY a JSON mapping object, no markdown, no comments:
{ "header_map": { "Навність": "is_present", "ПІП дитини": "full_name" } }
Only include headers you are confident about. Never map two headers to the same key.`;

const VALID = ['is_present', 'row_number', 'team_number', 'full_name', 'phone', 'team_name', 'note_from_table'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function fetchSheet(url: string) {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) return json({ error: 'BAD_URL', message: 'Не вдалося розпізнати посилання Google Sheets' }, 400);
  const gid = url.match(/[#?&]gid=(\d+)/)?.[1] ?? '0';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(csvUrl, { redirect: 'follow', signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      return json({ error: 'SHEET_HTTP_' + res.status, message: 'Таблиця недоступна. Відкрий доступ «Усі, хто має посилання — Переглядач».' }, 400);
    }
    if (text.trim().startsWith('<')) {
      return json({ error: 'SHEET_PRIVATE', message: 'Таблиця закрита. Відкрий доступ за посиланням (Переглядач).' }, 400);
    }
    return json({ csv: text, spreadsheet_id: id, gid });
  } catch (e) {
    clearTimeout(t);
    return json({ error: 'SHEET_FETCH_FAILED', message: String((e as Error).message || e) }, 502);
  } finally {
    clearTimeout(t);
  }
}

async function mapHeaders(headers: string[], samples: any[][]) {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) return json({ error: 'NO_KEY', header_map: {} }, 200);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 800,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `HEADERS: ${JSON.stringify(headers)}\nSAMPLE ROWS:\n${samples.slice(0, 5).map((r) => JSON.stringify(r)).join('\n')}`,
          },
        ],
      }),
    });
    const raw = await res.text();
    if (!res.ok) return json({ error: `GROQ_HTTP_${res.status}`, message: raw.slice(0, 300), header_map: {} }, 200);
    const content = JSON.parse(raw)?.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
    const src = parsed.header_map ?? parsed;
    const clean: Record<string, string> = {};
    const used = new Set<string>();
    for (const [h, k] of Object.entries(src)) {
      if (typeof k !== 'string' || !VALID.includes(k) || used.has(k)) continue;
      if (!headers.includes(h)) continue;
      clean[h] = k;
      used.add(k);
    }
    return json({ header_map: clean, source: 'ai' });
  } catch (e) {
    const msg = String((e as Error).message || e);
    return json({ error: msg.includes('abort') ? 'TIMEOUT_12S' : 'GROQ_ERROR', message: msg, header_map: {} }, 200);
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    if (body.action === 'fetch_sheet') return await fetchSheet(String(body.url ?? ''));
    if (body.action === 'map_headers') return await mapHeaders(body.headers ?? [], body.samples ?? []);
    return json({ error: 'BAD_ACTION' }, 400);
  } catch (e) {
    return json({ error: 'BAD_REQUEST', message: String((e as Error).message || e) }, 400);
  }
});
