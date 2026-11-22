import { admin, corsHeaders, json, SERVICE_KEY } from '../_shared/accounts.ts';
import { heuristicGender } from '../_shared/gender.ts';

/** «На зміні» (checked_in). Старі версії стійки ще надсилають is_present — це той самий намір «прибув». */
const arrival = (x: any): boolean | undefined =>
  typeof x?.checked_in === 'boolean' ? x.checked_in : typeof x?.is_present === 'boolean' ? x.is_present : undefined;
/** Старим версіям стійки віддаємо прибуття й під давньою назвою is_present. */
const legacy = <T extends { checked_in?: boolean }>(row: T) => ({ ...row, is_present: row.checked_in });

// Пароль реєстраційної стійки живе лише в секретах функції (REGISTRY_PASSWORD), не в коді.
const REGISTRY_PASSWORD = (Deno.env.get('REGISTRY_PASSWORD') ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const TOKEN_TTL_MS = 14 * 3600_000;
const LIMIT_PER_MIN = 5;
/** Видалений учасник висить у «Видалених» добу; потім профіль недоступний (див. private.my_child_id). */
const DELETE_GRACE_MS = 24 * 3600_000;

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
/**
 * Токен із пароля стійки: "<exp>.<sig>". Токен працівника з Telegram (tg-auth): "<exp>.<sig>.<user_id>" —
 * діє, лише поки акаунт активний, тож вимкнений працівник втрачає стійку одразу, а не через 14 годин.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function valid(token: unknown, svc: ReturnType<typeof admin>): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const [exp, sig, userId, extra] = token.split('.');
  if (!exp || !sig || extra !== undefined || Number(exp) < Date.now()) return false;
  if (userId !== undefined && !UUID.test(userId)) return false;
  const good = await hmac(userId ? `registry:${exp}:${userId}` : `registry:${exp}`);
  if (good.length !== sig.length) return false;
  let d = 0;
  for (let i = 0; i < good.length; i++) d |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  if (d !== 0) return false;
  if (!userId) return true;
  const { data } = await svc.from('staff_members').select('is_active').eq('user_id', userId).maybeSingle();
  return Boolean(data?.is_active);
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
      // Без секрету вхід вимкнено, а не відкритий.
      if (!REGISTRY_PASSWORD) return json({ error: 'registry_disabled' });
      const p = canon(String(body.password ?? ''));
      if (p !== REGISTRY_PASSWORD && toUa(p) !== REGISTRY_PASSWORD) {
        await svc.from('login_attempts').insert({ scope: 'registry', key: ip });
        return json({ error: 'invalid_password' });
      }
      return json({ token: await issue() });
    }

    if (!(await valid(body.token, svc))) return json({ error: 'unauthorized' });

    // Активні зміни; якщо передано shift_id — працюємо лише в її межах.
    const activeShifts = async () => {
      // Тип зміни — щоб стійка підписувала команди спортивної зміни «1-СПОРТ».
      const { data, error } = await svc.from('shifts').select('id, name, shift_type, shift_category').eq('is_active', true).is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; shift_type: string; shift_category: string | null }[];
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
        .select('id, shift_id, full_name, team_number, phone, note_from_table, supervisor_notes, checked_in, checked_in_at, checked_in_by, gender, telegram_username, updated_at, deleted_at')
        .in('shift_id', ids).gt('updated_at', body.since).order('updated_at').limit(500);
      if (error) throw error;
      return json({ children: (data ?? []).map(legacy) });
    }

    if (body.action === 'list') {
      const { shifts, ids } = await scopeIds(body.shift_id);
      if (!ids.length) return json({ shifts, children: [] });
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await svc.from('children')
          .select('id, shift_id, full_name, team_number, phone, note_from_table, supervisor_notes, checked_in, checked_in_at, checked_in_by, gender, telegram_username, updated_at')
          .in('shift_id', ids).is('deleted_at', null).order('full_name').order('id').range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return json({ shifts, children: all.map(legacy) });
    }

    // Пакет дій одним запитом: менше обривів на поганому інтернеті.
    // Нотатки: якщо хтось інший змінив нотатку після того, як ми почали редагувати (base),
    // не перезаписуємо, а дописуємо — так 4 людини паралельно не стирають одна одну.
    if (body.action === 'batch') {
      const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
      const ids = items.map((i) => i?.id).filter((x) => typeof x === 'string');
      if (!ids.length) return json({ results: [] });
      const { data: rows, error: rowsError } = await svc.from('children').select('id, supervisor_notes, updated_at, shifts!inner(is_active, deleted_at)')
        .in('id', ids).eq('shifts.is_active', true).is('shifts.deleted_at', null).is('deleted_at', null);
      if (rowsError) throw rowsError;
      const cur = new Map((rows ?? []).map((r: any) => [r.id, r]));
      const results = await Promise.all(items.map(async (it) => {
        let row: any = cur.get(it?.id);
        if (!row) return { id: it?.id, status: 'not_found' };
        // Compare-and-swap retries protect genuinely simultaneous note edits.
        for (let attempt = 0; attempt < 5; attempt++) {
        const patch: Record<string, unknown> = {};
        if (typeof arrival(it) === 'boolean') patch.checked_in = arrival(it);
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
        let update = svc.from('children').update(patch).eq('id', it.id).is('deleted_at', null);
        update = row.updated_at ? update.eq('updated_at', row.updated_at) : update.is('updated_at', null);
        const { data, error } = await update
          .select('id, checked_in, checked_in_at, checked_in_by, supervisor_notes, updated_at').maybeSingle();
        if (error) return { id: it.id, status: 'error' };
        if (data) return { id: it.id, status: 'ok', child: legacy(data) };
        const { data: latest, error: readError } = await svc.from('children')
          .select('id, supervisor_notes, updated_at, shifts!inner(is_active, deleted_at)')
          .eq('id', it.id).eq('shifts.is_active', true).is('shifts.deleted_at', null).is('deleted_at', null).maybeSingle();
        if (readError) return { id: it.id, status: 'error' };
        if (!latest) return { id: it.id, status: 'not_found' };
        row = latest;
        }
        return { id: it.id, status: 'error' };
      }));
      return json({ results });
    }

    const ROW = 'id, shift_id, full_name, team_number, phone, note_from_table, supervisor_notes, checked_in, checked_in_at, checked_in_by, gender, telegram_username, updated_at, deleted_at';
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

    // Новий учасник прямо зі стійки: лише в активну зміну.
    if (body.action === 'create') {
      const { ids } = await scopeIds(null);
      const shiftId = typeof body.shift_id === 'string' && ids.includes(body.shift_id) ? body.shift_id : null;
      if (!shiftId) return json({ error: 'bad_shift' });
      const fullName = str(body.full_name, 120);
      if (fullName.length < 3 || fullName.split(' ').length < 2) return json({ error: 'bad_name' });
      const team = Number(body.team_number);
      if (!Number.isInteger(team) || team < 1 || team > 999) return json({ error: 'bad_team' });
      const phone = str(body.phone, 40).replace(/[^\d+()\- ]/g, '') || null;
      const telegram = str(body.telegram_username, 64).replace(/^@+/, '').replace(/[^\w]/g, '') || null;
      // Стать у базі — boy/girl/unknown; не вказали — визначаємо за ПІБ (решту доробить фонове визначення).
      const picked = body.gender === 'girl' || body.gender === 'female' ? 'girl' : body.gender === 'boy' || body.gender === 'male' ? 'boy' : null;
      const guessed = picked ?? heuristicGender(fullName);
      const gender = guessed === 'unknown' ? null : guessed;
      const note = str(body.note, 2000) || null;
      if (!body.force) {
        const { data: same, error } = await svc.from('children').select('id, full_name, team_number')
          .eq('shift_id', shiftId).is('deleted_at', null).ilike('full_name', fullName.replace(/[%_\\]/g, '\\$&')).limit(1);
        if (error) throw error;
        if (same?.length) return json({ error: 'duplicate', existing: same[0] });
      }
      const { data, error } = await svc.from('children').insert({
        shift_id: shiftId, full_name: fullName, team_number: team, phone, telegram_username: telegram, gender,
        supervisor_notes: note, notes_origin: note ? 'registry' : null, checked_in: arrival(body) === true,
      }).select(ROW).single();
      if (error) throw error;
      return json({ child: legacy(data) });
    }

    // М'яке видалення: зникає з команди одразу, 24 години можна відновити.
    if (body.action === 'delete' || body.action === 'restore') {
      if (typeof body.id !== 'string') return json({ error: 'bad_request' });
      const { ids } = await scopeIds(null);
      if (!ids.length) return json({ error: 'not_found' });
      const now = new Date().toISOString();
      let q = svc.from('children')
        .update({ deleted_at: body.action === 'delete' ? now : null, updated_at: now })
        .eq('id', body.id).in('shift_id', ids);
      q = body.action === 'delete'
        ? q.is('deleted_at', null)
        : q.gt('deleted_at', new Date(Date.now() - DELETE_GRACE_MS).toISOString());
      const { data, error } = await q.select(ROW).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: body.action === 'restore' ? 'expired' : 'not_found' });
      return json({ child: legacy(data) });
    }

    if (body.action === 'deleted') {
      const { ids } = await scopeIds(body.shift_id);
      if (!ids.length) return json({ children: [] });
      const { data, error } = await svc.from('children').select(ROW)
        .in('shift_id', ids).gt('deleted_at', new Date(Date.now() - DELETE_GRACE_MS).toISOString())
        .order('deleted_at', { ascending: false }).limit(500);
      if (error) throw error;
      return json({ children: (data ?? []).map(legacy) });
    }

    if (body.action === 'update') {
      const patch: Record<string, unknown> = {};
      if (typeof arrival(body) === 'boolean') patch.checked_in = arrival(body);
      if (typeof body.supervisor_notes === 'string') {
        patch.supervisor_notes = body.supervisor_notes.slice(0, 2000);
        patch.notes_origin = 'registry';
      }
      if (!body.id || !Object.keys(patch).length) return json({ error: 'bad_request' });
      const { data: own } = await svc.from('children').select('id, shifts!inner(is_active, deleted_at)')
        .eq('id', body.id).eq('shifts.is_active', true).is('shifts.deleted_at', null).maybeSingle();
      if (!own) return json({ error: 'not_found' });
      const { data, error } = await svc.from('children').update(patch).eq('id', body.id).is('deleted_at', null)
        .select('id, checked_in, checked_in_at, checked_in_by, supervisor_notes, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'not_found' });
      return json({ child: legacy(data) });
    }

    return json({ error: 'unknown_action' });
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});
