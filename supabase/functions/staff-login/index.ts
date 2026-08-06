import { corsHeaders, issueSession, json } from '../_shared/accounts.ts';

const ADMIN_TEAM = 99;
const ADMIN_PASSWORD = 'Adminlex';
const SUPERVISOR_PREFIX = 'Супровід';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const rawTeam = String(body?.team ?? '').replace(/[^\d]/g, '');
    const password = typeof body?.password === 'string' ? body.password : '';
    const team = rawTeam ? parseInt(rawTeam, 10) : 0;

    if (!team || team < 1 || team > 999 || !password || password.length > 200) {
      return json({ error: 'invalid_credentials' }, 400);
    }

    if (team === ADMIN_TEAM && password === ADMIN_PASSWORD) {
      const session = await issueSession('staff-admin@ironhelp.local', 'admin', { team_number: ADMIN_TEAM });
      return json({ role: 'admin', team, session });
    }

    if (password !== `${SUPERVISOR_PREFIX}${team}`) {
      return json({ error: 'invalid_credentials' }, 401);
    }

    const session = await issueSession(`staff-team-${team}@ironhelp.local`, 'supervisor', { team_number: team });
    return json({ role: 'supervisor', team, session });
  } catch (_e) {
    return json({ error: 'login_failed' }, 500);
  }
});
