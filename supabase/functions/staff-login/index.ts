import { admin as adminClient, corsHeaders, issueSession, json } from '../_shared/accounts.ts';
import { clientKey, peek, recordFailure, resetFailures, sleep } from '../_shared/ratelimit.ts';

const ADMIN_TEAM = 99;
/**
 * Єдина канонічна форма пароля: Unicode NFC, без пробілів по краях,
 * нижній регістр, подвійні пробіли згорнуті. Використовується І при збереженні,
 * І при перевірці — інакше адмін-панель і вхід розходяться.
 */
function canonical(s: string): string {
  return (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
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

function toCyrillicLayout(s: string): string {
  return [...s].map((ch) => {
    const i = EN_KEYS.indexOf(ch);
    return i === -1 ? ch : UA_KEYS[i];
  }).join('');
}

function passwordMatches(input: string, expected: string): boolean {
  const inp = canonical(input);
  const exp = canonical(expected);
  return constantTimeEqual(inp, exp)
    || constantTimeEqual(canonical(toLatinLayout(inp)), exp)
    || constantTimeEqual(canonical(toCyrillicLayout(inp)), exp);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // Командні паролі супроводу вимкнено: супровід входить через особисті акаунти (staff-accounts).
    if (body?.action === 'list_team_passwords' || body?.action === 'update_team_password' || body?.action === 'set_team_password') {
      return json({ error: 'team_passwords_disabled' }, 410);
    }

    // =========================================================================
    // ВХІД АДМІНІСТРАТОРА (команда 99)
    // =========================================================================
    const rawTeam = String(body?.team ?? '').replace(/[^\d]/g, '');
    const password = typeof body?.password === 'string' ? body.password : '';
    const team = rawTeam ? parseInt(rawTeam, 10) : 0;

    if (!team || team < 1 || team > 999 || !password || password.length > 200) {
      return json({ error: 'invalid_credentials' }, 400);
    }

    // Адмін: не більше 3 невдалих спроб на хвилину з однієї IP — лічильник у базі,
    // тому не скидається між запусками сервера. Плюс загальна стеля 15/хв для всіх IP.
    const adminIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    if (team === ADMIN_TEAM) {
      const db = adminClient();
      const since = new Date(Date.now() - 60_000).toISOString();
      const [{ count: mine }, { count: all }] = await Promise.all([
        db.from('login_attempts').select('id', { count: 'exact', head: true }).eq('scope', 'admin').eq('key', adminIp).gte('created_at', since),
        db.from('login_attempts').select('id', { count: 'exact', head: true }).eq('scope', 'admin').gte('created_at', since),
      ]);
      if ((mine ?? 0) >= 3 || (all ?? 0) >= 15) return json({ error: 'too_many_attempts' }, 200);
    }

    const rlKey = clientKey(req, `staff:${team}`);
    const before = peek(rlKey);
    if (before.hits > 10) return json({ error: 'too_many_attempts' }, 200);
    if (before.hits >= 3) await sleep(1200 * Math.min(before.hits, 5));

    // Вхід адміністратора
    if (team === ADMIN_TEAM) {
      const adminPassword = Deno.env.get('STAFF_ADMIN_PASSWORD');
      if (!adminPassword || !passwordMatches(password, adminPassword)) {
        const db = adminClient();
        await db.from('login_attempts').insert({ scope: 'admin', key: adminIp });
        db.from('login_attempts').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString()).then(() => {}, () => {});
        const v = recordFailure(rlKey, { slowAfter: 3 });
        if (v.blocked) return json({ error: 'too_many_attempts' }, 200);
        return json({ error: 'invalid_credentials' }, 200);
      }
      resetFailures(rlKey);
      const session = await issueSession('staff-admin@ironhelp.local', 'admin', { team_number: ADMIN_TEAM });
      return json({ role: 'admin', team, session });
    }

    // Вхід за паролем команди вимкнено: лише адміністратор (99) через цю функцію.
    const v = recordFailure(rlKey, { slowAfter: 3 });
    if (v.blocked) return json({ error: 'too_many_attempts' }, 200);
    return json({ error: 'invalid_credentials' }, 200);
  } catch (e) {
    console.error('staff-login failed:', e instanceof Error ? e.message : e);
    return json({ error: 'login_failed' }, 500);
  }
});
