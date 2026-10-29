import { admin, corsHeaders, json, SERVICE_KEY } from '../_shared/accounts.ts';

// Пароль реєстраційної стійки живе лише на сервері.
const REGISTRY_PASSWORD = 'стефанія2026';
const TOKEN_TTL_MS = 14 * 3600_000;
const LIMIT_PER_MIN = 5;

const enc = new TextEncoder();
async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function issue(): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${await hmac(`registry:${exp}`)}`;
}
async function valid(token: unknown): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = await hmac(`registry:${exp}`);
  if (good.length !== sig.length) return false;
  let d = 0;
  for (let i = 0; i < good.length; i++) d |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}
const canon = (s: string) => (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const UA = 'йцукенгшщзхїфівапролджєячсмитьбю.';
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const toUa = (s: string) => [...s].map((c) => (EN.indexOf(c) >= 0 ? UA[EN.indexOf(c)] : c)).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const svc = admin();

    if (body.action === 'login') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await svc.from('login_attempts').select('id', { count: 'exact', head: true })
        .eq('scope', 'registry').eq('key', ip).gte('created_at', since);
      if ((count ?? 0) >= LIMIT_PER_MIN) return json({ error: 'too_many_attempts' });
      const p = canon(String(body.password ?? ''));
      if (p !== REGISTRY_PASSWORD && toUa(p) !== REGISTRY_PASSWORD) {
        await svc.from('login_attempts').insert({ scope: 'registry', key: ip });
        return json({ error: 'invalid_password' });
      }
      return json({ token: await issue() });
    }

    if (!(await valid(body.token))) return json({ error: 'unauthorized' });

    // Активні зміни; якщо передано shift_id — працюємо лише в її межах.
    const activeShifts = async () => {
      const { data } = await svc.from('shifts').select('id, name').eq('is_active', true).is('deleted_at', null);
      return (data ?? []) as { id: string; name: string }[];
    };
    const scopeIds = async (shiftId: unknown) => {
      const shifts = await activeShifts();
      const ids = shifts.map((s) => s.id);
      return { shifts, ids: typeof shiftId === 'string' && ids.includes(shiftId) ? [shiftId] : ids };
    };

    if (body.action === 'shifts') return json({ shifts: await activeShifts() });

    // Дельта: лише діти, змінені після since — легкий запит кожні кілька секунд.
    if (body.action === 'changes' && typeof body.since === 'string') {
      const { ids } = await scopeIds(body.shift_id);
      if (!ids.length) return json({ children: [] });
      const { data, error } = await svc.from('children')
        .select('id, shift_id, full_name, team_number, phone, note_from_table, supervisor_notes, is_present, gender, telegram_username, updated_at, deleted_at')
        .in('shift_id', ids).gt('updated_at', body.since).order('updated_at').limit(500);
      if (error) throw error;
      return json({ children: data ?? [] });
    }

    if (body.action === 'list') {
      const { shifts, ids } = await scopeIds(body.shift_id);
      if (!ids.length) return json({ shifts, children: [] });
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await svc.from('children')
          .select('id, shift_id, full_name, team_number, phone, note_from_table, supervisor_notes, is_present, gender, telegram_username, updated_at')
          .in('shift_id', ids).is('deleted_at', null).order('full_name').range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return json({ shifts, children: all });
    }

    // Пакет дій одним запитом: менше обривів на поганому інтернеті.
    // Нотатки: якщо хтось інший змінив нотатку після того, як ми почали редагувати (base),
    // не перезаписуємо, а дописуємо — так 4 людини паралельно не стирають одна одну.
    if (body.action === 'batch') {
      const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
      const ids = items.map((i) => i?.id).filter((x) => typeof x === 'string');
      if (!ids.length) return json({ results: [] });
      const { data: rows } = await svc.from('children').select('id, supervisor_notes, shifts!inner(is_active, deleted_at)')
        .in('id', ids).eq('shifts.is_active', true).is('shifts.deleted_at', null).is('deleted_at', null);
      const cur = new Map((rows ?? []).map((r: any) => [r.id, r]));
      const results = await Promise.all(items.map(async (it) => {
        const row: any = cur.get(it?.id);
        if (!row) return { id: it?.id, status: 'not_found' };
        const patch: Record<string, unknown> = {};
        if (typeof it.is_present === 'boolean') patch.is_present = it.is_present;
        if (typeof it.supervisor_notes === 'string') {
          let note = it.supervisor_notes.slice(0, 2000);
          const now = row.supervisor_notes ?? '';
          if (typeof it.base_note === 'string' && now !== it.base_note && now !== note && !note.includes(now)) {
            note = (now ? `${now}\n— ` : '') + note;
          }
          patch.supervisor_notes = note.slice(0, 4000);
          patch.notes_origin = 'registry';
        }
        if (!Object.keys(patch).length) return { id: it.id, status: 'ok' };
        const { data, error } = await svc.from('children').update(patch).eq('id', it.id)
          .select('id, is_present, supervisor_notes, updated_at').maybeSingle();
        return error ? { id: it.id, status: 'error' } : { id: it.id, status: 'ok', child: data };
      }));
      return json({ results });
    }

    if (body.action === 'update') {
      const patch: Record<string, unknown> = {};
      if (typeof body.is_present === 'boolean') patch.is_present = body.is_present;
      if (typeof body.supervisor_notes === 'string') {
        patch.supervisor_notes = body.supervisor_notes.slice(0, 2000);
        patch.notes_origin = 'registry';
      }
      if (!body.id || !Object.keys(patch).length) return json({ error: 'bad_request' });
      const { data: own } = await svc.from('children').select('id, shifts!inner(is_active, deleted_at)')
        .eq('id', body.id).eq('shifts.is_active', true).is('shifts.deleted_at', null).maybeSingle();
      if (!own) return json({ error: 'not_found' });
      const { data, error } = await svc.from('children').update(patch).eq('id', body.id).is('deleted_at', null)
        .select('id, is_present, supervisor_notes, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'not_found' });
      return json({ child: data });
    }

    return json({ error: 'unknown_action' });
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});
