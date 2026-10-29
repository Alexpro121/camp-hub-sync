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

    if (body.action === 'list') {
      const { data: shifts } = await svc.from('shifts').select('id, name')
        .eq('is_active', true).is('deleted_at', null);
      const ids = (shifts ?? []).map((s: any) => s.id);
      if (!ids.length) return json({ shifts: [], children: [] });
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

    if (body.action === 'update') {
      const patch: Record<string, unknown> = {};
      if (typeof body.is_present === 'boolean') patch.is_present = body.is_present;
      if (typeof body.supervisor_notes === 'string') patch.supervisor_notes = body.supervisor_notes.slice(0, 2000);
      if (!body.id || !Object.keys(patch).length) return json({ error: 'bad_request' });
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
