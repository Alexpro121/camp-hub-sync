import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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
export async function issueSession(
  email: string,
  role: 'admin' | 'supervisor' | 'child',
  extra: { team_number?: number | null; child_id?: string | null },
) {
  const password = await derivePassword(email);
  const svc = admin();

  let userId: string | null = null;
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) {
    userId = created.user.id;
  } else if (createErr) {
    // Already exists — reset to the derived password so sign-in is deterministic.
    const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error('account_unavailable');
    userId = found.id;
    await svc.auth.admin.updateUserById(userId, { password, email_confirm: true });
  }
  if (!userId) throw new Error('account_unavailable');

  // Idempotent: concurrent logins for the same identity must not race each other.
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

  const staleIds = (existing ?? []).filter((r) => r.id !== match?.id).map((r) => r.id);
  if (staleIds.length) await svc.from('user_roles').delete().in('id', staleIds);

  if (!match) {
    const { error: roleErr } = await svc.from('user_roles').insert({
      user_id: userId,
      role,
      team_number: extra.team_number ?? null,
      child_id: extra.child_id ?? null,
    });
    // A concurrent request may have inserted the same row first — that's fine.
    if (roleErr && roleErr.code !== '23505') {
      throw new Error(`role_assignment_failed: ${roleErr.message}`);
    }
  }

  const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
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
