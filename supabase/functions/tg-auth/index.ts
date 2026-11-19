import { admin, corsHeaders, issueSession, json, SERVICE_KEY } from '../_shared/accounts.ts';
import { verifyInitData } from '../_shared/telegramCore.ts';
import { ADMIN_TG_IDS, BOT_TOKEN, INIT_DATA_MAX_AGE, sessionForUser, syncEnvAdmin } from '../_shared/telegramServer.ts';
import { demoIdentity, type SwapRole } from '../_shared/telegramDemo.ts';

/**
 * Вхід у Mini App. Клієнт надсилає лише Telegram.WebApp.initData; сервер перевіряє підпис
 * токеном бота і сам вирішує, хто це: дитина, супровід, адмін або ніхто.
 * Жодних паролів, ПІБ чи ролей від клієнта не приймаємо.
 *
 * Відповіді:
 *  { state: 'ok', role: 'child', childId, teamNumber, shiftId, session }
 *  { state: 'ok', role: 'staff' | 'admin', kind, fullName, session, registryToken } — токен стійки реєстрації для працівників
 *  { state: 'unlinked' }  — акаунт не прив'язаний: треба натиснути «Старт» у боті
 *  { state: 'pending' }   — заявка на реєстрацію чекає на адміна
 *  { state: 'revoked' }   — акаунт супроводу вимкнено
 */
/**
 * Токен стійки реєстрації (той самий формат, що видає функція registry за паролем):
 * у Telegram стійку відкриває будь-який активний працівник без пароля.
 */
const REGISTRY_TOKEN_TTL_MS = 14 * 3600_000;
async function registryToken(): Promise<string> {
  const exp = Date.now() + REGISTRY_TOKEN_TTL_MS;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`registry:${exp}`)));
  return `${exp}.${Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!BOT_TOKEN) return json({ error: 'telegram_not_configured' }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const verified = await verifyInitData(String(body?.initData ?? ''), BOT_TOKEN, INIT_DATA_MAX_AGE);
    if (!verified.ok) return json({ error: verified.reason === 'expired' ? 'init_data_expired' : 'invalid_init_data' }, 401);
    const tgId = verified.user.id;
    const svc = admin();

    // ТИМЧАСОВО: демо-режим /swap лише для адмінів зі списку TELEGRAM_ADMIN_IDS.
    if (ADMIN_TG_IDS.has(tgId)) {
      const { data: swap } = await svc.from('telegram_role_swaps').select('role').eq('tg_user_id', tgId).maybeSingle();
      const demo = swap ? await demoIdentity(svc, swap.role as SwapRole) : null;
      if (demo?.role === 'child') return json({ state: 'ok', role: 'child', childId: demo.childId, teamNumber: demo.teamNumber, shiftId: demo.shiftId, session: demo.session, demo: true });
      if (demo) return json({ state: 'ok', role: 'staff', kind: demo.kind, fullName: demo.fullName, session: demo.session, registryToken: await registryToken(), demo: true });
    }

    const { data: link, error: linkErr } = await svc
      .from('telegram_links')
      .select('kind, child_id, user_id, admin_from_env')
      .eq('tg_user_id', tgId)
      .eq('status', 'active')
      .maybeSingle();
    if (linkErr) return json({ error: 'auth_unavailable' }, 503);

    if (!link) {
      const { data: pending } = await svc
        .from('telegram_staff_requests')
        .select('id')
        .eq('tg_user_id', tgId)
        .eq('status', 'pending')
        .maybeSingle();
      return json({ state: pending ? 'pending' : 'unlinked' });
    }

    if (link.kind === 'child') {
      const { data: child } = await svc
        .from('children')
        .select('id, team_number, shift_id, deleted_at')
        .eq('id', link.child_id)
        .maybeSingle();
      if (!child || child.deleted_at) return json({ state: 'unlinked' });
      const session = await issueSession(`child-${child.id}@ironhelp.local`, 'child', { child_id: child.id });
      return json({ state: 'ok', role: 'child', childId: child.id, teamNumber: child.team_number, shiftId: child.shift_id, session });
    }

    const { data: member } = await svc
      .from('staff_members')
      .select('user_id, full_name, kind, is_active')
      .eq('user_id', link.user_id)
      .maybeSingle();
    if (!member || !member.is_active) return json({ state: 'revoked' });

    // Адміністратори задаються списком Telegram ID (лікар не може бути адміном); прибраний зі списку втрачає роль.
    const isAdmin = await syncEnvAdmin(svc, tgId, member.user_id, member.kind, Boolean(link.admin_from_env));
    const session = await sessionForUser(svc, member.user_id);
    return json({ state: 'ok', role: isAdmin ? 'admin' : 'staff', kind: member.kind, fullName: member.full_name, session, registryToken: await registryToken() });
  } catch (e) {
    console.error('tg-auth failed:', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'login_failed' }, 500);
  }
});
