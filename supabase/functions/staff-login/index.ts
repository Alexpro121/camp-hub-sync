import { admin as adminClient, corsHeaders, issueSession, json } from '../_shared/accounts.ts';
import { clientKey, peek, recordFailure, resetFailures, sleep } from '../_shared/ratelimit.ts';

const ADMIN_TEAM = 99;
const SUPERVISOR_PREFIX = 'Супровід';

/** Дефолтний пароль для команди за замовчуванням */
function defaultSupervisorPassword(team: number): string {
  return `${SUPERVISOR_PREFIX}${team}`;
}

/** Серверна генерація резервного HMAC-пароля */
async function supervisorPassword(team: number): Promise<string> {
  const secret = Deno.env.get('STAFF_SUPERVISOR_SECRET') ?? '';
  if (!secret) return defaultSupervisorPassword(team);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`supervisor:${team}`));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(new Uint8Array(sig).slice(0, 10))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// Підтримка помилкової розкладки клавіатури ЙЦУКЕН <-> QWERTY
const UA_KEYS = 'йцукенгшщзхїфівапролджєячсмитьбю.ЙЦУКЕНГШЩЗХЇФІВАПРОЛДЖЄЯЧСМИТЬБЮ,';
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?";

function toLatinLayout(s: string): string {
  return [...s].map((ch) => {
    const i = UA_KEYS.indexOf(ch);
    return i === -1 ? ch : EN_KEYS[i];
  }).join('');
}

function passwordMatches(input: string, expected: string): boolean {
  const inp = input.trim().toLowerCase();
  const exp = expected.trim().toLowerCase();
  return constantTimeEqual(inp, exp) || constantTimeEqual(toLatinLayout(inp), exp);
}

/** Отримання збереженої карти паролів з активної зміни */
async function getShiftPasswords(svc: any): Promise<{ shiftId: string | null; passwords: Record<string, string> }> {
  const { data } = await svc
    .from('shifts')
    .select('id, team_passwords')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const map = (data?.team_passwords && typeof data.team_passwords === 'object')
    ? (data.team_passwords as Record<string, string>)
    : {};
  return { shiftId: data?.id ?? null, passwords: map };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // =========================================================================
    // 1. ОТРИМАННЯ СПИСКУ ПАРОЛІВ ДЛЯ АДМІНІСТРАТОРА
    // =========================================================================
    if (body?.action === 'list_team_passwords') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!token) return json({ error: 'unauthorized' }, 401);
      const svc = adminClient();
      const { data: userData } = await svc.auth.getUser(token);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const { data: roles } = await svc.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin');
      if (!roles?.length) return json({ error: 'forbidden' }, 403);

      const [{ data: teams }, { data: shifts }] = await Promise.all([
        svc.from('children').select('team_number'),
        svc.from('shifts').select('id, team_passwords, assigned_teams').order('start_date', { ascending: false }).limit(1),
      ]);

      const detectedTeams = (teams ?? []).map((t: { team_number: number }) => t.team_number).filter(Boolean);
      const assigned = (shifts?.[0]?.assigned_teams || []) as number[];
      const unique = [...new Set([...detectedTeams, ...assigned])].sort((a: number, b: number) => a - b);
      const teamList = unique.length ? unique : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const shiftMap = (shifts?.[0]?.team_passwords && typeof shifts[0].team_passwords === 'object')
        ? (shifts[0].team_passwords as Record<string, string>)
        : {};

      const list = teamList.map((t: number) => ({
        team: t,
        password: shiftMap[String(t)] || defaultSupervisorPassword(t),
      }));

      return json({ passwords: list });
    }

    // =========================================================================
    // 2. ЗБЕРЕЖЕННЯ / ОНОВЛЕННЯ ПАРОЛЯ КОМАНДИ АДМІНІСТРАТОРОМ
    // =========================================================================
    if (body?.action === 'update_team_password' || body?.action === 'set_team_password') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!token) return json({ error: 'unauthorized' }, 401);
      const svc = adminClient();
      const { data: userData } = await svc.auth.getUser(token);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const { data: roles } = await svc.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin');
      if (!roles?.length) return json({ error: 'forbidden' }, 403);

      const targetTeam = Number(body?.team ?? body?.team_number);
      const targetPass = String(body?.password ?? body?.new_password ?? '').trim().toLowerCase();

      if (!targetTeam || targetTeam < 1 || targetTeam > 999 || !targetPass) {
        return json({ error: 'invalid_team_or_password' }, 400);
      }

      const { shiftId, passwords: currentMap } = await getShiftPasswords(svc);
      if (!shiftId) {
        return json({ error: 'no_active_shift_found' }, 404);
      }

      currentMap[String(targetTeam)] = targetPass;

      const { error: updateErr } = await svc
        .from('shifts')
        .update({ team_passwords: currentMap })
        .eq('id', shiftId);

      if (updateErr) {
        console.error('Update error:', updateErr);
        return json({ error: 'database_update_failed' }, 500);
      }

      return json({ ok: true, team: targetTeam, password: targetPass });
    }

    // =========================================================================
    // 3. АВТОРИЗАЦІЯ СУПРОВОДУ / АДМІНІСТРАТОРА
    // =========================================================================
    const rawTeam = String(body?.team ?? '').replace(/[^\d]/g, '');
    const password = typeof body?.password === 'string' ? body.password : '';
    const team = rawTeam ? parseInt(rawTeam, 10) : 0;

    if (!team || team < 1 || team > 999 || !password || password.length > 200) {
      return json({ error: 'invalid_credentials' }, 400);
    }

    const rlKey = clientKey(req, `staff:${team}`);
    const before = peek(rlKey);
    if (before.hits > 10) return json({ error: 'too_many_attempts' }, 429);
    if (before.hits >= 3) await sleep(1200 * Math.min(before.hits, 5));

    // Вхід адміністратора
    if (team === ADMIN_TEAM) {
      const adminPassword = Deno.env.get('STAFF_ADMIN_PASSWORD') ?? 'admin2026';
      if (!passwordMatches(password, adminPassword)) {
        const v = recordFailure(rlKey, { slowAfter: 3 });
        if (v.blocked) return json({ error: 'too_many_attempts' }, 429);
        return json({ error: 'invalid_credentials' }, 401);
      }
      resetFailures(rlKey);
      const session = await issueSession('staff-admin@ironhelp.local', 'admin', { team_number: ADMIN_TEAM });
      return json({ role: 'admin', team, session });
    }

    // Вхід супроводу команди:
    // 1) Перевірка індивідуального пароля з бази (наприклад, "потяг.гори")
    const { passwords: customMap } = await getShiftPasswords(adminClient());
    const customPass = customMap[String(team)];

    let ok = false;
    if (customPass) {
      ok = passwordMatches(password, customPass);
    }

    // 2) Резервна перевірка дефолтного "Супровід<номер>"
    if (!ok) {
      ok = passwordMatches(password, defaultSupervisorPassword(team));
    }

    // 3) Резервна перевірка HMAC-пароля
    if (!ok) {
      try {
        ok = passwordMatches(password, await supervisorPassword(team));
      } catch (_e) {
        ok = false;
      }
    }

    if (!ok) {
      const v = recordFailure(rlKey, { slowAfter: 3 });
      if (v.blocked) return json({ error: 'too_many_attempts' }, 429);
      return json({ error: 'invalid_credentials' }, 401);
    }

    resetFailures(rlKey);
    const session = await issueSession(`staff-team-${team}@ironhelp.local`, 'supervisor', { team_number: team });
    return json({ role: 'supervisor', team, session });
  } catch (e) {
    console.error('staff-login failed:', e instanceof Error ? e.message : e);
    return json({ error: 'login_failed' }, 500);
  }
});
