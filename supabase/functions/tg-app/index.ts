import { admin, corsHeaders, json } from '../_shared/accounts.ts';
import { cleanFullName, safeEqual, type StaffKind, verifyInitData } from '../_shared/telegramCore.ts';
import { ADMIN_TG_IDS, BOT_TOKEN, INIT_DATA_MAX_AGE, registrationLink, registrationPayload } from '../_shared/telegramServer.ts';
import {
  activeLink,
  childConfirm,
  childSearch,
  childTeams,
  decideRequest,
  isAdminTg,
  pendingRequests,
  rebindDecide,
  rebindList,
  recordChildAttempt,
  registerStaff,
  verifiedPhone,
} from '../_shared/telegramActions.ts';
import { joinToken, loadShiftInvite } from '../_shared/shiftInvite.ts';

/**
 * Дії Mini App у Telegram: прив'язка дитини, реєстрація працівників, заявки й переприв'язки.
 * Кожен запит несе підписаний Telegram initData; хто це, сервер визначає сам.
 */
const KINDS: StaffKind[] = ['supervisor', 'duckling', 'doctor'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!BOT_TOKEN) return json({ error: 'telegram_not_configured' }, 503);
  try {
    const body = await req.json().catch(() => ({}));
    const verified = await verifyInitData(String(body?.initData ?? ''), BOT_TOKEN, INIT_DATA_MAX_AGE);
    if (!verified.ok) return json({ error: verified.reason === 'expired' ? 'init_data_expired' : 'invalid_init_data' }, 401);
    const user = verified.user;
    const svc = admin();
    const action = String(body?.action ?? '');

    // Код реєстрації: з посилання (?reg=) або зі start_param підписаного initData.
    const regOk = async () => {
      const expected = await registrationPayload();
      const given = String(body?.code ?? verified.startParam ?? '');
      return Boolean(expected && given && safeEqual(given, expected));
    };

    // Посилання зміни (/staff/join/<код> або startapp=join_<код>): саме посилання і є дозволом на реєстрацію, як на сайті.
    const start = verified.startParam?.startsWith('join_') ? verified.startParam : '';
    const joinGiven = Boolean(body?.join || start);
    const shiftInvite = () => loadShiftInvite(svc, joinToken(body?.join || start));

    switch (action) {
      /* ---------- дитина ---------- */
      case 'child_teams':
        return json({ teams: await childTeams(svc) });
      case 'child_search':
        return json(await childSearch(svc, user, String(body?.name ?? ''), Number(body?.team)));
      case 'child_reject':
        await recordChildAttempt(svc, user.id);
        return json({ ok: true });
      case 'child_confirm':
        return json(await childConfirm(svc, user, String(body?.ticket ?? '')));

      /* ---------- реєстрація працівників ---------- */
      case 'reg_status': {
        const invite = joinGiven ? await shiftInvite() : null;
        const linked = Boolean(await activeLink(svc, user.id));
        if (joinGiven && !invite) return json({ allowed: false, joinInvalid: true, linked, adminCandidate: false, hasPhone: false, join: null });
        const allowed = Boolean(invite) || ADMIN_TG_IDS.has(user.id) || (await regOk());
        return json({
          allowed, linked, adminCandidate: !invite && ADMIN_TG_IDS.has(user.id), hasPhone: Boolean(await verifiedPhone(svc, user.id)),
          join: invite ? { shift: invite.shift.name, kind: invite.inv.kind } : null,
        });
      }
      case 'reg_submit': {
        const invite = joinGiven ? await shiftInvite() : null;
        if (joinGiven && !invite) return json({ state: 'invalid_code' });
        if (!invite && !ADMIN_TG_IDS.has(user.id) && !(await regOk())) return json({ state: 'invalid_code' });
        const name = cleanFullName(body?.fullName);
        if (!name) return json({ state: 'invalid_name' });
        const kind = invite ? invite.inv.kind as StaffKind : KINDS.includes(body?.kind) ? body.kind as StaffKind : 'supervisor';
        return json(await registerStaff(svc, user, name, kind, invite?.inv));
      }

      /* ---------- адмін ---------- */
      case 'admin_overview': {
        if (!(await isAdminTg(svc, user.id))) return json({ error: 'forbidden' }, 403);
        const [link, requests, rebinds] = await Promise.all([registrationLink(), pendingRequests(svc), rebindList(svc, user.id)]);
        return json({ link, requests, rebinds });
      }
      case 'request_decide': {
        if (!(await isAdminTg(svc, user.id))) return json({ error: 'forbidden' }, 403);
        const id = String(body?.id ?? '');
        if (!UUID.test(id)) return json({ error: 'invalid_input' }, 400);
        const kind = KINDS.includes(body?.kind) ? body.kind as StaffKind : 'supervisor';
        return json(await decideRequest(svc, user, id, body?.approve === true, kind));
      }

      /* ---------- переприв'язки (супровід команди або адмін) ---------- */
      case 'rebind_list':
        return json({ rebinds: await rebindList(svc, user.id) });
      case 'rebind_decide': {
        const id = String(body?.id ?? '');
        if (!UUID.test(id)) return json({ error: 'invalid_input' }, 400);
        return json(await rebindDecide(svc, user, id, body?.approve === true));
      }
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('tg-app failed:', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'failed' }, 500);
  }
});
