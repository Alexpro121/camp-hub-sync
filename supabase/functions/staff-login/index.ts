import { admin as adminClient, corsHeaders, issueSession, json } from '../_shared/accounts.ts';

const ADMIN_TEAM = 99;
const SUPERVISOR_PREFIX = 'Супровід';

/** Default, easy-to-share supervisor password for a team. */
function defaultSupervisorPassword(team: number): string {
  return `${SUPERVISOR_PREFIX}${team}`;
}

/**
 * Per-team supervisor passwords are derived from a server-only random secret,
 * so they are unique, unguessable and rotatable (rotate STAFF_SUPERVISOR_SECRET).
 */
async function supervisorPassword(team: number): Promise<string> {
  const secret = Deno.env.get('STAFF_SUPERVISOR_SECRET') ?? '';
  if (!secret) throw new Error('not_configured');
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

// Wrong-keyboard-layout tolerance: map Ukrainian/Russian ЙЦУКЕН chars to their QWERTY keys.
const UA_KEYS = 'йцукенгшщзхїфівапролджєячсмитьбю.ЙЦУКЕНГШЩЗХЇФІВАПРОЛДЖЄЯЧСМИТЬБЮ,';
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?";

function toLatinLayout(s: string): string {
  return [...s].map((ch) => {
    const i = UA_KEYS.indexOf(ch);
    return i === -1 ? ch : EN_KEYS[i];
  }).join('');
}

/** Compare in constant time, also accepting the same password typed in the Cyrillic layout. */
function passwordMatches(input: string, expected: string): boolean {
  return constantTimeEqual(input, expected) || constantTimeEqual(toLatinLayout(input), expected);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // Admin-only: list the current per-team supervisor passwords for distribution.
    if (body?.action === 'list_team_passwords') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      if (!token) return json({ error: 'unauthorized' }, 401);
      const svc = adminClient();
      const { data: userData } = await svc.auth.getUser(token);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const { data: roles } = await svc.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin');
      if (!roles?.length) return json({ error: 'forbidden' }, 403);

      const { data: teams } = await svc.from('children').select('team_number');
      const unique = [...new Set((teams ?? []).map((t: { team_number: number }) => t.team_number))].sort((a, b) => a - b);
      const list = [];
      for (const t of unique) list.push({ team: t, password: defaultSupervisorPassword(t) });
      return json({ passwords: list });
    }

    const rawTeam = String(body?.team ?? '').replace(/[^\d]/g, '');
    const password = typeof body?.password === 'string' ? body.password : '';
    const team = rawTeam ? parseInt(rawTeam, 10) : 0;

    if (!team || team < 1 || team > 999 || !password || password.length > 200) {
      return json({ error: 'invalid_credentials' }, 400);
    }

    if (team === ADMIN_TEAM) {
      const adminPassword = Deno.env.get('STAFF_ADMIN_PASSWORD') ?? '';
      if (!adminPassword) return json({ error: 'not_configured' }, 503);
      if (!passwordMatches(password, adminPassword)) return json({ error: 'invalid_credentials' }, 401);
      const session = await issueSession('staff-admin@ironhelp.local', 'admin', { team_number: ADMIN_TEAM });
      return json({ role: 'admin', team, session });
    }

    // Default password is "Супровід<номер команди>"; the derived code stays valid as a fallback.
    let ok = constantTimeEqual(password, defaultSupervisorPassword(team));
    if (!ok) {
      try {
        ok = passwordMatches(password, await supervisorPassword(team));
      } catch (_e) {
        ok = false;
      }
    }
    if (!ok) {
      return json({ error: 'invalid_credentials' }, 401);
    }

    const session = await issueSession(`staff-team-${team}@ironhelp.local`, 'supervisor', { team_number: team });
    return json({ role: 'supervisor', team, session });
  } catch (_e) {
    return json({ error: 'login_failed' }, 500);
  }
});
