import { admin, json, corsHeaders, requireUser } from '../_shared/accounts.ts';

type Gender = 'boy' | 'girl' | 'unknown';
const GATEWAY = 'https://ai.gateway.lovable.dev/v1/systemone';
const MODEL = 'typesafe/jev-latest';
const BATCH = 25;
const MAX_PER_CALL = 200;

/** Швидкий локальний фолбек: по батькові, потім прізвище. */
export function heuristicGender(fullName: string): Gender {
  const tokens = (fullName || '').toLowerCase().replace(/[’ʼ`']/g, "'").split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (/(ович|евич|йович|ич)$/.test(t)) return 'boy';
    if (/(івна|ївна|овна|евна|ична|інічна)$/.test(t)) return 'girl';
  }
  const s = tokens[0] ?? '';
  if (/(ська|цька|зька|ова|ева|єва|іна|їна|ина)$/.test(s)) return 'girl';
  if (/(ський|цький|зький|ов|ев|єв|ін|їн|ин)$/.test(s)) return 'boy';
  return 'unknown';
}

let jevBlocked: number | null = null;

async function askJev(names: Record<string, string>): Promise<Record<string, Gender> | null> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key || jevBlocked) return null;
  const questions: Record<string, unknown> = {};
  for (const id of Object.keys(names)) {
    questions[id] = {
      type: 'choice',
      instructions: `Determine the gender of the child whose Ukrainian full name (ПІБ: surname, first name, optional patronymic) is \`names.${id}\`. Use the first name and patronymic/surname endings.`,
      criteria: {
        boy: 'The name belongs to a boy (male first name or male patronymic/surname form).',
        girl: 'The name belongs to a girl (female first name or female patronymic/surname form).',
        unknown: 'The name is ambiguous or not a recognizable personal name.',
      },
    };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(GATEWAY, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({ model: MODEL, state: { names }, questions }),
    });
    if (!res.ok) {
      console.warn('jev status', res.status, (await res.text()).slice(0, 200));
      // 400/401/402/403/404 are terminal — stop calling Jev for the rest of this request.
      if (res.status !== 429 && res.status < 500) jevBlocked = res.status;
      return null;
    }
    const data = await res.json();
    const out: Record<string, Gender> = {};
    for (const id of Object.keys(names)) {
      const a = data?.answers?.[id];
      const c = a?.choice;
      const conf = typeof a?.confidence === 'number' ? a.confidence : 1;
      if ((c === 'boy' || c === 'girl') && conf >= 0.5) out[id] = c;
      else if (c === 'boy' || c === 'girl' || c === 'unknown') out[id] = 'unknown';
    }
    return out;
  } catch (e) {
    console.warn('jev failed', String((e as Error).message || e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function detectMany(rows: { id: string; full_name: string }[]): Promise<Record<string, Gender>> {
  const result: Record<string, Gender> = {};
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const names: Record<string, string> = {};
    chunk.forEach((r, j) => { names[`c${j}`] = r.full_name; });
    const ai = await askJev(names);
    chunk.forEach((r, j) => {
      const g = ai?.[`c${j}`];
      const h = heuristicGender(r.full_name);
      result[r.id] = g && g !== 'unknown' ? g : h;
    });
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const auth = await requireUser(req);
    if (auth.response) return auth.response;
    const svc = admin();
    const { data: roles } = await svc.from('user_roles').select('role, team_number').eq('user_id', auth.user!.id);
    const isAdmin = (roles ?? []).some((r) => r.role === 'admin');
    const myTeam = (roles ?? []).find((r) => r.role === 'supervisor')?.team_number ?? null;
    if (!isAdmin && myTeam == null) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'detect' ? 'detect' : 'backfill';

    let q = svc.from('children').select('id, full_name, team_number').is('deleted_at', null);
    if (!isAdmin) q = q.eq('team_number', myTeam);
    if (action === 'detect') {
      const id = String(body?.childId ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'invalid_child' }, 400);
      q = q.eq('id', id);
    } else {
      q = q.is('gender', null).limit(MAX_PER_CALL);
    }
    const { data: rows, error } = await q;
    if (error) return json({ error: 'load_failed' }, 500);
    if (!rows?.length) return json({ updated: 0, results: {} });

    const results = await detectMany(rows as { id: string; full_name: string }[]);
    await Promise.all(
      Object.entries(results).map(([id, gender]) => svc.from('children').update({ gender }).eq('id', id)),
    );
    return json({ updated: Object.keys(results).length, results, ai: jevBlocked ? `unavailable_${jevBlocked}` : 'ok' });
  } catch (e) {
    console.error('detect-gender failed', e instanceof Error ? e.message : e);
    return json({ error: 'detect_failed' }, 500);
  }
});
