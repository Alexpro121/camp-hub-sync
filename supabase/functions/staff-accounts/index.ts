import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { admin, ANON_KEY, corsHeaders, ensureRole, json, SUPABASE_URL } from '../_shared/accounts.ts';
import { clientKey, peek, recordFailure, resetFailures, sleep } from '../_shared/ratelimit.ts';

/** Логін: латиниця/цифри/._- , 3..40 символів, нижній регістр */
function normLogin(s: unknown): string | null {
  // Прощаємо типові помилки: "@", пробіли, набір в українській розкладці
  const UA = 'йцукенгшщзхїфівапролджєячсмитьбюґ';
  const EN = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`';
  const v = String(s ?? '').normalize('NFC').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '')
    .split('').map((ch) => { const i = UA.indexOf(ch); return i >= 0 ? EN[i] : ch; }).join('')
    .replace(/[,]/g, '.');
  return /^[a-z0-9._-]{3,40}$/.test(v) ? v : null;
}
const emailFor = (login: string) => `staff.${login}@ironhelp.local`;
/** ПІБ для пошуку: нижній регістр, єдиний апостроф, одинарні пробіли */
function normName(s: unknown): string | null {
  const v = String(s ?? '').normalize('NFC').toLowerCase().replace(/[’ʼ`´‘"]/g, "'").replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  return v.length >= 3 && v.length <= 120 && /\p{L}/u.test(v) ? v : null;
}


const clean = (v: unknown, max: number) => String(v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, max);
const normPhone = (v: unknown) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 9 && d.length <= 15 ? '+' + (d.length === 9 ? '380' + d : d.length === 10 && d.startsWith('0') ? '38' + d : d) : null; };
const normTg = (v: unknown) => { const t = String(v ?? '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@+/, ''); return /^[A-Za-z0-9_]{4,32}$/.test(t) ? t : null; };
const okAvatar = (v: unknown) => typeof v === 'string' && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 90000;
const KINDS = ['supervisor', 'duckling'];

// Фото супроводу зберігаються у сховищі, у базі — лише короткий шлях "storage:<path>".
const AVATAR_BUCKET = 'staff-avatars';
async function storeAvatar(svc: any, uid: string, dataUrl: string): Promise<string | null> {
  const m = /^data:(image\/(?:jpeg|webp|png));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const ext = m[1].split('/')[1];
  const path = `${uid}/${Date.now()}.${ext}`;
  const { error } = await svc.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: m[1], upsert: true });
  if (error) return null;
  const { data: old } = await svc.storage.from(AVATAR_BUCKET).list(uid);
  const stale = (old ?? []).map((f: any) => `${uid}/${f.name}`).filter((p: string) => p !== path);
  if (stale.length) await svc.storage.from(AVATAR_BUCKET).remove(stale);
  return `storage:${path}`;
}
/** Перетворює збережені шляхи на тимчасові посилання; старі data-URL переносить у сховище. */
async function resolveAvatars<T extends { user_id?: string; avatar_url: string | null }>(svc: any, rows: T[], uidOf: (r: T) => string): Promise<T[]> {
  for (const r of rows) {
    if (r.avatar_url?.startsWith('data:')) {
      const ref = await storeAvatar(svc, uidOf(r), r.avatar_url);
      if (ref) { await svc.from('staff_members').update({ avatar_url: ref }).eq('user_id', uidOf(r)); r.avatar_url = ref; }
    }
  }
  const paths = rows.map((r) => r.avatar_url).filter((a): a is string => !!a?.startsWith('storage:')).map((a) => a.slice(8));
  if (!paths.length) return rows;
  const { data } = await svc.storage.from(AVATAR_BUCKET).createSignedUrls(paths, 60 * 60 * 24 * 7);
  const map = new Map<string, string>((data ?? []).filter((d: any) => d.signedUrl).map((d: any) => [d.path, d.signedUrl]));
  return rows.map((r) => (r.avatar_url?.startsWith('storage:') ? { ...r, avatar_url: map.get(r.avatar_url.slice(8)) ?? null } : r));
}

async function loadInvite(svc: any, token: string, ignoreUses = false) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await svc.from('staff_invites').select('*').eq('token', token).maybeSingle();
  if (!data || data.revoked) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  if (!ignoreUses && data.max_uses != null && data.uses >= data.max_uses) return null;
  return data;
}

async function loadInviteShift(svc: any, shiftId: string | null) {
  if (!shiftId) return null;
  const { data } = await svc.from('shifts').select('id, name, start_date, end_date, assigned_teams, deleted_at').eq('id', shiftId).maybeSingle();
  return data && !data.deleted_at ? data : null;
}

// Реальні команди зміни: ті, де є діти; якщо дітей ще не імпортовано — призначені адміном.
async function shiftTeams(svc: any, shift: any) {
  const [{ data: kids }, { data: asg }] = await Promise.all([
    svc.from('children').select('team_number').eq('shift_id', shift.id).is('deleted_at', null).limit(5000),
    svc.from('staff_assignments').select('team_number, staff_members(full_name, kind)').eq('shift_id', shift.id),
  ]);
  const counts = new Map<number, number>();
  for (const k of kids ?? []) if (Number.isInteger(k.team_number) && k.team_number > 0) counts.set(k.team_number, (counts.get(k.team_number) ?? 0) + 1);
  const base = counts.size ? [...counts.keys()] : (shift.assigned_teams ?? []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
  return [...new Set<number>(base)].sort((a, b) => a - b).map((team) => ({
    team,
    children: counts.get(team) ?? 0,
    staff: (asg ?? []).filter((a: any) => a.team_number === team && a.staff_members).map((a: any) => a.staff_members.full_name.split(' ').slice(0, 2).join(' ')),
  }));
}

async function authUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data?.user ?? null;
}

async function isAdmin(uid: string) {
  const { data } = await admin().from('user_roles').select('id').eq('user_id', uid).eq('role', 'admin');
  return Boolean(data?.length);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');
    const svc = admin();

    // ---------- ВХІД СУПРОВОДУ ----------
    if (action === 'login') {
      const raw = String(body?.login ?? '').slice(0, 160);
      const login = normLogin(raw);
      const nameKey = normName(raw);
      const password = typeof body?.password === 'string' ? body.password : '';
      if ((!login && !nameKey) || !password || password.length > 200) return json({ error: 'invalid_credentials' }, 200);

      const rl = clientKey(req, `staffacc:${login ?? nameKey}`);
      const before = peek(rl);
      if (before.hits > 10) return json({ error: 'too_many_attempts' }, 200);
      if (before.hits >= 3) await sleep(1000 * Math.min(before.hits, 5));

      // Кандидати: точний логін, або ПІБ (без регістру, зайвих пробілів, різних апострофів)
      const candidates: any[] = [];
      if (login) {
        const { data } = await svc.from('staff_members').select('user_id, full_name, login, is_active').eq('login', login).maybeSingle();
        if (data) candidates.push(data);
      }
      if (nameKey && nameKey.includes(' ')) {
        const first = nameKey.split(' ')[0];
        const { data } = await svc.from('staff_members').select('user_id, full_name, login, is_active').ilike('full_name', `%${first.replace(/[%_]/g, '')}%`).limit(50);
        for (const m of data ?? []) {
          if (normName(m.full_name) === nameKey && !candidates.some((c) => c.user_id === m.user_id)) candidates.push(m);
        }
      }

      const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      let signIn: any = null; let member: any = null;
      for (const c of candidates.filter((c) => c.is_active).slice(0, 5)) {
        const { data } = await pub.auth.signInWithPassword({ email: emailFor(c.login), password });
        if (data?.session) { signIn = data; member = c; break; }
      }
      if (!signIn?.session) {
        recordFailure(rl, { slowAfter: 3 });
        return json({ error: 'invalid_credentials' }, 200);
      }
      resetFailures(rl);
      // Без прив'язки до команди, доки супровід не обере зміну в кабінеті.
      await ensureRole(svc, signIn.user.id, 'supervisor', { team_number: null });
      return json({ session: signIn.session, full_name: member.full_name });
    }

    // ---------- РЕЄСТРАЦІЯ ЗА ПОСИЛАННЯМ ----------
    if (action === 'invite_check') {
      const inv = await loadInvite(svc, String(body?.token ?? ''));
      if (!inv) return json({ error: 'invite_invalid' });
      const shift = await loadInviteShift(svc, inv.shift_id ?? null);
      if (inv.shift_id && !shift) return json({ error: 'invite_invalid' });
      const teams = shift ? await shiftTeams(svc, shift) : [];
      return json({ ok: true, kind: inv.kind, label: inv.label, shift, teams });
    }

    if (action === 'register') {
      const rl = clientKey(req, `staffreg:${String((body as any)?.token ?? '')}`);
      if (peek(rl).hits > 15) return json({ error: 'too_many_attempts' });
      const inv = await loadInvite(svc, String(body?.token ?? ''));
      if (!inv) { recordFailure(rl, { slowAfter: 5 }); return json({ error: 'invite_invalid' }); }
      const full_name = clean(body?.full_name, 120);
      const phone = normPhone(body?.phone);
      const tgRaw = String(body?.telegram ?? '').trim();
      const telegram = tgRaw ? normTg(tgRaw) : null;
      const login = normLogin(body?.login);
      const password = String(body?.password ?? '');
      if (full_name.split(' ').length < 2) return json({ error: 'bad_name' });
      if (!phone) return json({ error: 'bad_phone' });
      if (tgRaw && !telegram) return json({ error: 'bad_telegram' });
      if (!login) return json({ error: 'bad_login' });
      if (password.length < 6 || password.length > 72) return json({ error: 'weak_password' });
      const { data: exists } = await svc.from('staff_members').select('user_id').eq('login', login).maybeSingle();
      if (exists) return json({ error: 'login_taken' });
      // Місце витрачається під час реєстрації; вибір команди за цим же посиланням уже не списує ще одне.
      {
        const { data: claimed } = await svc.from('staff_invites').update({ uses: inv.uses + 1 })
          .eq('id', inv.id).eq('uses', inv.uses).select('id');
        if (!claimed?.length) return json({ error: 'invite_busy' });
      }
      const { data: created, error } = await svc.auth.admin.createUser({ email: emailFor(login), password, email_confirm: true });
      if (error || !created.user) {
        await svc.from('staff_invites').update({ uses: inv.uses }).eq('id', inv.id).eq('uses', inv.uses + 1);
        const weak = /weak|pwned|guess/i.test(error?.message ?? '');
        return json({ error: weak ? 'weak_password' : 'create_failed' });
      }
      await svc.from('staff_members').insert({ user_id: created.user.id, full_name, login, phone, telegram, kind: inv.kind, registered_via: inv.id });
      await ensureRole(svc, created.user.id, 'supervisor', { team_number: null });
      const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { data: signIn } = await pub.auth.signInWithPassword({ email: emailFor(login), password });
      return json({ ok: true, session: signIn?.session ?? null, full_name });
    }

    const user = await authUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    // ---------- САМОПРИЗНАЧЕННЯ ЗА ПОСИЛАННЯМ ЗМІНИ ----------
    if (action === 'join_shift') {
      const { data: me } = await svc.from('staff_members').select('registered_via').eq('user_id', user.id).maybeSingle();
      const rawInv = await loadInvite(svc, String(body?.token ?? ''), true);
      // Хто зареєструвався саме за цим посиланням, завжди може завершити вибір команди.
      const ownInvite = !!rawInv && me?.registered_via === rawInv.id;
      const inv = rawInv && (ownInvite || rawInv.max_uses == null || rawInv.uses < rawInv.max_uses) ? rawInv : null;
      const shift = inv ? await loadInviteShift(svc, inv.shift_id ?? null) : null;
      const team = Math.floor(Number(body?.team_number));
      if (!inv || !shift) return json({ error: 'invite_invalid' });
      const allowedTeams = (await shiftTeams(svc, shift)).map((t) => t.team);
      if (!allowedTeams.includes(team)) return json({ error: 'invalid_team' });
      const { data: member } = await svc.from('staff_members').select('user_id, is_active').eq('user_id', user.id).maybeSingle();
      if (!member?.is_active) return json({ error: 'not_staff' }, 403);
      const { data: existingShift } = await svc.from('staff_assignments').select('id, team_number').eq('staff_user_id', user.id).eq('shift_id', shift.id).limit(1).maybeSingle();
      if (existingShift) return json({ ok: true, shift_id: shift.id, shift_name: shift.name, team_number: existingShift.team_number, already_assigned: true });
      const claim = !ownInvite;
      if (claim) {
        const { data: claimed } = await svc.from('staff_invites').update({ uses: inv.uses + 1 })
          .eq('id', inv.id).eq('uses', inv.uses).select('id');
        if (!claimed?.length) return json({ error: 'invite_busy' });
      }
      const { error } = await svc.from('staff_assignments').insert({ staff_user_id: user.id, shift_id: shift.id, team_number: team });
      if (error) {
        if (claim) await svc.from('staff_invites').update({ uses: inv.uses }).eq('id', inv.id).eq('uses', inv.uses + 1);
        return json({ error: 'assign_failed' }, 500);
      }
      return json({ ok: true, shift_id: shift.id, shift_name: shift.name, team_number: team });
    }

    // ---------- КАБІНЕТ ----------
    if (action === 'cabinet') {
      const { data: member } = await svc.from('staff_members').select('full_name, login, kind, phone, telegram, avatar_url').eq('user_id', user.id).maybeSingle();
      if (!member) return json({ error: 'not_staff' }, 403);
      const { data: asg } = await svc
        .from('staff_assignments')
        .select('id, team_number, shift_id, shifts(id, name, shift_type, start_date, end_date, deleted_at)')
        .eq('staff_user_id', user.id);

      const items = await Promise.all((asg ?? []).filter((a: any) => a.shifts && !a.shifts.deleted_at).map(async (a: any) => {
        const [kids, transfers, talent] = await Promise.all([
          svc.from('children').select('iron_dollars').eq('shift_id', a.shift_id).eq('team_number', a.team_number).is('deleted_at', null),
          svc.from('transfers').select('id, children!inner(shift_id)', { count: 'exact', head: true })
            .eq('children.shift_id', a.shift_id).or(`from_team.eq.${a.team_number},to_team.eq.${a.team_number}`),
          svc.from('talent_entries').select('id, talent_events!inner(shift_id)', { count: 'exact', head: true })
            .eq('talent_events.shift_id', a.shift_id).eq('team_number', a.team_number),
        ]);
        const list = kids.data ?? [];
        return {
          id: a.id,
          team_number: a.team_number,
          shift: { id: a.shifts.id, name: a.shifts.name, shift_type: a.shifts.shift_type, start_date: a.shifts.start_date, end_date: a.shifts.end_date },
          stats: {
            children: list.length,
            iron_total: list.reduce((s: number, c: any) => s + (c.iron_dollars ?? 0), 0),
            transfers: transfers.count ?? 0,
            talents: talent.count ?? 0,
          },
        };
      }));
      const [withAvatar] = await resolveAvatars(svc, [{ ...member }], () => user.id);
      return json({ full_name: member.full_name, login: member.login, kind: member.kind, phone: member.phone, telegram: member.telegram, avatar_url: withAvatar.avatar_url, assignments: items });
    }

    // ---------- ВХІД У ЗМІНУ ----------
    if (action === 'enter_shift') {
      const { data: a } = await svc.from('staff_assignments').select('team_number, shift_id')
        .eq('id', String(body?.assignment_id ?? '')).eq('staff_user_id', user.id).maybeSingle();
      if (!a) return json({ error: 'forbidden' }, 403);
      await ensureRole(svc, user.id, 'supervisor', { team_number: a.team_number });
      return json({ ok: true, team: a.team_number, shift_id: a.shift_id });
    }

    // ---------- СВІЙ ПРОФІЛЬ ----------
    if (action === 'update_profile') {
      const patch: Record<string, unknown> = {};
      if ('avatar_url' in body) {
        if (body.avatar_url === null) patch.avatar_url = null;
        else if (okAvatar(body.avatar_url)) {
          const ref = await storeAvatar(svc, user.id, body.avatar_url);
          if (!ref) return json({ error: 'update_failed' }, 500);
          patch.avatar_url = ref;
        }
        else return json({ error: 'bad_avatar' });
      }
      if ('phone' in body) { const p = normPhone(body.phone); if (!p) return json({ error: 'bad_phone' }); patch.phone = p; }
      if ('telegram' in body) {
        const raw = String(body.telegram ?? '').trim();
        const t = raw ? normTg(raw) : null; if (raw && !t) return json({ error: 'bad_telegram' }); patch.telegram = t;
      }
      if (!Object.keys(patch).length) return json({ ok: true });
      const { error } = await svc.from('staff_members').update(patch).eq('user_id', user.id);
      return error ? json({ error: 'update_failed' }, 500) : json({ ok: true });
    }

    // ---------- АДМІН ----------
    if (!(await isAdmin(user.id))) return json({ error: 'forbidden' }, 403);

    if (action === 'list') {
      const [{ data: members }, { data: asg }] = await Promise.all([
        svc.from('staff_members').select('user_id, full_name, login, is_active, created_at, kind, phone, telegram, avatar_url').order('full_name'),
        svc.from('staff_assignments').select('id, staff_user_id, shift_id, team_number'),
      ]);
      return json({ members: await resolveAvatars(svc, (members ?? []) as any[], (m: any) => m.user_id), assignments: asg ?? [] });
    }

    if (action === 'create') {
      const login = normLogin(body?.login);
      const full_name = String(body?.full_name ?? '').trim().slice(0, 120);
      const password = String(body?.password ?? '');
      if (!login || !full_name || password.length < 6) return json({ error: 'invalid_input' }, 400);
      const { data: exists } = await svc.from('staff_members').select('user_id').eq('login', login).maybeSingle();
      if (exists) return json({ error: 'login_taken' }, 409);
      const { data: created, error } = await svc.auth.admin.createUser({ email: emailFor(login), password, email_confirm: true });
      if (error || !created.user) return json({ error: /weak|pwned|guess/i.test(error?.message ?? '') ? 'weak_password' : 'create_failed' });
      const kind = KINDS.includes(String(body?.kind)) ? String(body.kind) : 'supervisor';
      await svc.from('staff_members').insert({ user_id: created.user.id, full_name, login, kind, phone: normPhone(body?.phone), telegram: normTg(body?.telegram) });
      await ensureRole(svc, created.user.id, 'supervisor', { team_number: null });
      return json({ ok: true });
    }

    if (action === 'set_password') {
      const password = String(body?.password ?? '');
      if (password.length < 6) return json({ error: 'invalid_input' }, 400);
      const { error } = await svc.auth.admin.updateUserById(String(body?.user_id), { password });
      return error ? json({ error: /weak|pwned|guess/i.test(error.message) ? 'weak_password' : 'update_failed' }) : json({ ok: true });
    }

    if (action === 'set_active') {
      await svc.from('staff_members').update({ is_active: Boolean(body?.is_active) }).eq('user_id', String(body?.user_id));
      return json({ ok: true });
    }

    if (action === 'delete') {
      const uid = String(body?.user_id);
      const { data: m } = await svc.from('staff_members').select('user_id').eq('user_id', uid).maybeSingle();
      if (!m) return json({ error: 'not_found' }, 404);
      await svc.from('staff_members').delete().eq('user_id', uid);
      await svc.auth.admin.deleteUser(uid);
      return json({ ok: true });
    }

    if (action === 'assign') {
      const team = Number(body?.team_number);
      if (!team || team < 1 || team > 999) return json({ error: 'invalid_input' }, 400);
      const { error } = await svc.from('staff_assignments')
        .upsert({ staff_user_id: String(body?.user_id), shift_id: String(body?.shift_id), team_number: team }, { onConflict: 'staff_user_id,shift_id,team_number' });
      return error ? json({ error: 'assign_failed' }, 500) : json({ ok: true });
    }

    // ---------- ПЕРЕНЕСЕННЯ СТАРИХ КОМАНДНИХ ВХОДІВ ----------
    if (action === 'migrate_legacy') {
      const { data: rows } = await svc.from('team_passwords').select('team, password').order('team');
      const cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
      const { data: shifts } = await svc.from('shifts').select('id, assigned_teams, end_date')
        .is('deleted_at', null).gte('end_date', cutoff);
      const report: Array<{ team: number; login: string; password: string; status: string }> = [];
      for (const r of rows ?? []) {
        const team = Number(r.team);
        if (!team || team < 1 || team > 999) continue;
        const login = `team${team}`;
        let password = String(r.password ?? '').trim();
        let status = 'ok';
        if (password.length < 6) { password = password + crypto.randomUUID().replace(/-/g, '').slice(0, 6); status = 'new_password'; }
        const { data: exists } = await svc.from('staff_members').select('user_id').eq('login', login).maybeSingle();
        let uid = exists?.user_id as string | undefined;
        if (uid) {
          await svc.auth.admin.updateUserById(uid, { password });
          if (status === 'ok') status = 'updated';
        } else {
          const { data: created, error } = await svc.auth.admin.createUser({ email: emailFor(login), password, email_confirm: true });
          if (error || !created.user) { report.push({ team, login, password: '', status: 'failed' }); continue; }
          uid = created.user.id;
          await svc.from('staff_members').insert({ user_id: uid, full_name: `Супровід команди №${team}`, login });
          await ensureRole(svc, uid, 'supervisor', { team_number: null });
        }
        for (const s of shifts ?? []) {
          const teams = (s.assigned_teams ?? []) as number[];
          if (teams.length && !teams.includes(team)) continue;
          await svc.from('staff_assignments').upsert({ staff_user_id: uid, shift_id: s.id, team_number: team }, { onConflict: 'staff_user_id,shift_id,team_number' });
        }
        report.push({ team, login, password, status });
      }
      return json({ ok: true, report });
    }

    if (action === 'update_member') {
      const patch: Record<string, unknown> = {};
      if ('full_name' in body) { const n = clean(body.full_name, 120); if (!n) return json({ error: 'bad_name' }); patch.full_name = n; }
      if ('kind' in body) { if (!KINDS.includes(String(body.kind))) return json({ error: 'invalid_input' }); patch.kind = body.kind; }
      if ('phone' in body) { const raw = String(body.phone ?? '').trim(); const p = raw ? normPhone(raw) : null; if (raw && !p) return json({ error: 'bad_phone' }); patch.phone = p; }
      if ('telegram' in body) { const raw = String(body.telegram ?? '').trim(); const t = raw ? normTg(raw) : null; if (raw && !t) return json({ error: 'bad_telegram' }); patch.telegram = t; }
      if ('avatar_url' in body && body.avatar_url === null) patch.avatar_url = null;
      await svc.from('staff_members').update(patch).eq('user_id', String(body?.user_id));
      return json({ ok: true });
    }

    if (action === 'invite_list') {
      const { data } = await svc.from('staff_invites').select('*').order('created_at', { ascending: false }).limit(50);
      return json({ invites: data ?? [] });
    }

    if (action === 'invite_create') {
      const max_uses = body?.max_uses == null || body.max_uses === '' ? null : Math.floor(Number(body.max_uses));
      const hours = body?.hours == null || body.hours === '' ? null : Number(body.hours);
      if (max_uses !== null && !(max_uses >= 1 && max_uses <= 500)) return json({ error: 'invalid_input' });
      if (hours !== null && !(hours > 0 && hours <= 24 * 60)) return json({ error: 'invalid_input' });
      if (max_uses === null && hours === null) return json({ error: 'need_limit' });
      const kind = KINDS.includes(String(body?.kind)) ? String(body.kind) : 'supervisor';
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const { data, error } = await svc.from('staff_invites').insert({
        token, kind, max_uses, label: clean(body?.label, 80) || null, created_by: user.id,
        expires_at: hours === null ? null : new Date(Date.now() + hours * 3600e3).toISOString(),
      }).select('*').single();
      return error ? json({ error: 'failed' }, 500) : json({ invite: data });
    }

    if (action === 'shift_invite_create') {
      const shiftId = String(body?.shift_id ?? '');
      const shift = await loadInviteShift(svc, shiftId);
      if (!shift || !(shift.assigned_teams ?? []).length) return json({ error: 'shift_needs_teams' });
      const { data: current } = await svc.from('staff_invites').select('*')
        .eq('shift_id', shiftId).eq('revoked', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (current && (current.max_uses == null || current.uses < current.max_uses)) return json({ invite: current });
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const expiresAt = new Date(`${shift.end_date}T23:59:59+03:00`);
      if (expiresAt.getTime() < Date.now() + 864e5) expiresAt.setTime(Date.now() + 7 * 864e5);
      const { data, error } = await svc.from('staff_invites').insert({
        token, kind: 'supervisor', shift_id: shiftId, max_uses: 500,
        label: `Супровід · ${shift.name}`, created_by: user.id, expires_at: expiresAt.toISOString(),
      }).select('*').single();
      return error ? json({ error: 'failed' }, 500) : json({ invite: data });
    }

    if (action === 'invite_revoke') {
      await svc.from('staff_invites').update({ revoked: true }).eq('id', String(body?.id));
      return json({ ok: true });
    }

    if (action === 'unassign') {
      await svc.from('staff_assignments').delete().eq('id', String(body?.assignment_id));
      return json({ ok: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('staff-accounts failed:', e instanceof Error ? e.message : e);
    return json({ error: 'failed' }, 500);
  }
});
