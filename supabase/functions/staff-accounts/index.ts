import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { admin, ANON_KEY, corsHeaders, ensureRole, json, SUPABASE_URL } from '../_shared/accounts.ts';
import { clientKey, peek, recordFailure, resetFailures, sleep } from '../_shared/ratelimit.ts';

/** Логін: латиниця/цифри/._- , 3..40 символів, нижній регістр */
function normLogin(s: unknown): string | null {
  const v = String(s ?? '').trim().toLowerCase();
  return /^[a-z0-9._-]{3,40}$/.test(v) ? v : null;
}
const emailFor = (login: string) => `staff.${login}@ironhelp.local`;

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
      const login = normLogin(body?.login);
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!login || !password || password.length > 200) return json({ error: 'invalid_credentials' }, 400);

      const rl = clientKey(req, `staffacc:${login}`);
      const before = peek(rl);
      if (before.hits > 10) return json({ error: 'too_many_attempts' }, 429);
      if (before.hits >= 3) await sleep(1000 * Math.min(before.hits, 5));

      const { data: member } = await svc.from('staff_members').select('user_id, full_name, is_active').eq('login', login).maybeSingle();
      const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { data: signIn } = member?.is_active
        ? await pub.auth.signInWithPassword({ email: emailFor(login), password })
        : { data: null as any };
      if (!signIn?.session) {
        recordFailure(rl, { slowAfter: 3 });
        return json({ error: 'invalid_credentials' }, 401);
      }
      resetFailures(rl);
      // Без прив'язки до команди, доки супровід не обере зміну в кабінеті.
      await ensureRole(svc, signIn.user.id, 'supervisor', { team_number: null });
      return json({ session: signIn.session, full_name: member!.full_name });
    }

    const user = await authUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    // ---------- КАБІНЕТ ----------
    if (action === 'cabinet') {
      const { data: member } = await svc.from('staff_members').select('full_name, login').eq('user_id', user.id).maybeSingle();
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
      return json({ full_name: member.full_name, login: member.login, assignments: items });
    }

    // ---------- ВХІД У ЗМІНУ ----------
    if (action === 'enter_shift') {
      const { data: a } = await svc.from('staff_assignments').select('team_number, shift_id')
        .eq('id', String(body?.assignment_id ?? '')).eq('staff_user_id', user.id).maybeSingle();
      if (!a) return json({ error: 'forbidden' }, 403);
      await ensureRole(svc, user.id, 'supervisor', { team_number: a.team_number });
      return json({ ok: true, team: a.team_number, shift_id: a.shift_id });
    }

    // ---------- АДМІН ----------
    if (!(await isAdmin(user.id))) return json({ error: 'forbidden' }, 403);

    if (action === 'list') {
      const [{ data: members }, { data: asg }] = await Promise.all([
        svc.from('staff_members').select('user_id, full_name, login, is_active, created_at').order('full_name'),
        svc.from('staff_assignments').select('id, staff_user_id, shift_id, team_number'),
      ]);
      return json({ members: members ?? [], assignments: asg ?? [] });
    }

    if (action === 'create') {
      const login = normLogin(body?.login);
      const full_name = String(body?.full_name ?? '').trim().slice(0, 120);
      const password = String(body?.password ?? '');
      if (!login || !full_name || password.length < 6) return json({ error: 'invalid_input' }, 400);
      const { data: exists } = await svc.from('staff_members').select('user_id').eq('login', login).maybeSingle();
      if (exists) return json({ error: 'login_taken' }, 409);
      const { data: created, error } = await svc.auth.admin.createUser({ email: emailFor(login), password, email_confirm: true });
      if (error || !created.user) return json({ error: 'create_failed' }, 500);
      await svc.from('staff_members').insert({ user_id: created.user.id, full_name, login });
      await ensureRole(svc, created.user.id, 'supervisor', { team_number: null });
      return json({ ok: true });
    }

    if (action === 'set_password') {
      const password = String(body?.password ?? '');
      if (password.length < 6) return json({ error: 'invalid_input' }, 400);
      const { error } = await svc.auth.admin.updateUserById(String(body?.user_id), { password });
      return error ? json({ error: 'update_failed' }, 500) : json({ ok: true });
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
