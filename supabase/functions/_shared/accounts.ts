import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// New-style secret keys (sb_secret_...) are opaque: they must go in `apikey`,
// never as a Bearer JWT, otherwise PostgREST treats the client as anonymous.
function serviceFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith('sb_secret_') && headers.get('Authorization') === `Bearer ${key}`) {
      headers.delete('Authorization');
    }
    headers.set('apikey', key);
    return fetch(input, { ...init, headers });
  };
}

export const admin = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: serviceFetch(SERVICE_KEY) },
  });

/** Deterministic, server-only password for an internal account identity. */
export async function derivePassword(identity: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SERVICE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(identity));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `Ih1!${hex}`;
}

/**
 * Ensure an internal auth account exists for `email`, that its role row matches,
 * then return a fresh session for it.
 */
async function findUserIdByEmail(svc: ReturnType<typeof admin>, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  // Посторінковий пошук: раніше дивились лише перші 1000 акаунтів — після кількох змін вхід ламався.
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const users = data?.users ?? [];
    const found = users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found.id;
    if (users.length < 1000) return null;
  }
  return null;
}

export async function ensureRole(
  svc: ReturnType<typeof admin>,
  userId: string,
  role: 'admin' | 'supervisor' | 'child',
  extra: { team_number?: number | null; child_id?: string | null },
) {
  const { data: existing } = await svc
    .from('user_roles')
    .select('id, role, team_number, child_id')
    .eq('user_id', userId);

  const match = (existing ?? []).find(
    (r) =>
      r.role === role &&
      (r.team_number ?? null) === (extra.team_number ?? null) &&
      (r.child_id ?? null) === (extra.child_id ?? null),
  );

  // Прибираємо лише застарілі записи тієї ж ролі — інші ролі (напр. admin) не чіпаємо.
  const staleIds = (existing ?? []).filter((r) => r.role === role && r.id !== match?.id).map((r) => r.id);
  if (staleIds.length) await svc.from('user_roles').delete().in('id', staleIds);

  if (!match) {
    const { error: roleErr } = await svc.from('user_roles').insert({
      user_id: userId,
      role,
      team_number: extra.team_number ?? null,
      child_id: extra.child_id ?? null,
    });
    if (roleErr && roleErr.code !== '23505') {
      throw new Error(`role_assignment_failed: ${roleErr.message}`);
    }
  }
}

/**
 * Ensure an internal auth account exists for `email`, that its role row matches,
 * then return a fresh session for it.
 *
 * Швидкий шлях (повторний вхід — 95% випадків під навантаженням): одразу входимо
 * детермінованим паролем. Повільний шлях (створення/скидання) — лише при першому вході.
 */
export async function issueSession(
  email: string,
  role: 'admin' | 'supervisor' | 'child',
  extra: { team_number?: number | null; child_id?: string | null },
) {
  const password = await derivePassword(email);
  const svc = admin();
  const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

  // 1. Швидкий шлях
  const fast = await pub.auth.signInWithPassword({ email, password });
  if (fast.data?.session && fast.data.user) {
    await ensureRole(svc, fast.data.user.id, role, extra);
    return fast.data.session;
  }

  // 2. Повільний шлях: створити акаунт або вирівняти пароль
  let userId: string | null = null;
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) {
    userId = created.user.id;
  } else if (createErr) {
    userId = await findUserIdByEmail(svc, email);
    if (!userId) throw new Error('account_unavailable');
    await svc.auth.admin.updateUserById(userId, { password, email_confirm: true });
  }
  if (!userId) throw new Error('account_unavailable');

  await ensureRole(svc, userId, role, extra);

  const { data: signIn, error: signInErr } = await pub.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn.session) throw new Error('sign_in_failed');
  return signIn.session;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Require a valid signed-in Supabase session.
 * Returns the user, or a 401 Response to return directly.
 */
export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, response: json({ error: 'Missing Authorization header' }, 401) };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await pub.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, response: json({ error: 'Unauthorized: Invalid token' }, 401) };
  }
  return { user: data.user, response: null as Response | null };
}
