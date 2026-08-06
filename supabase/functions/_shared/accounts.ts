import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const admin = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

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

  await svc.from('user_roles').delete().eq('user_id', userId);
  const { error: roleErr } = await svc.from('user_roles').insert({
    user_id: userId,
    role,
    team_number: extra.team_number ?? null,
    child_id: extra.child_id ?? null,
  });
  if (roleErr) throw new Error('role_assignment_failed');

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
