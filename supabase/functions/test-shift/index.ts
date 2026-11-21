import { admin, json } from '../_shared/accounts.ts';
import { assignToTestShift, liveTestShift, sendInvite } from '../_shared/testShift.ts';
import { BOT_TOKEN } from '../_shared/telegramServer.ts';

/**
 * Розсилка запрошень у тестову зміну. Службовий виклик: одноразовий токен, хеш якого лежить
 * в ops_tokens (purpose 'test-shift', з терміном дії). Тіло: { token, only_tg?: number }.
 * only_tg — пробне повідомлення одній людині (не позначається як розіслане).
 * Без only_tg — усім активним супровідникам і каченятам з Telegram, кому ще не надсилали.
 */

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!BOT_TOKEN) return json({ error: 'telegram_not_configured' }, 503);
  const body = await req.json().catch(() => ({}));
  const svc = admin();
  const token = String(body?.token ?? '');
  if (token.length < 32) return json({ error: 'unauthorized' }, 401);
  const { data: tok } = await svc.from('ops_tokens').select('token_hash').eq('token_hash', await sha256(token))
    .eq('purpose', 'test-shift').gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!tok) return json({ error: 'unauthorized' }, 401);

  const shift = await liveTestShift(svc);
  if (!shift) return json({ error: 'no_test_shift' }, 404);

  const onlyTg = Number(body?.only_tg ?? 0);
  const { data: links } = await svc.from('telegram_links').select('tg_user_id, user_id').eq('kind', 'staff').eq('status', 'active');
  const userIds = (links ?? []).map((l: { user_id: string }) => l.user_id).filter(Boolean);
  const { data: members } = await svc.from('staff_members').select('user_id, kind, is_active').in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
  const ok = new Set((members ?? []).filter((m: { kind: string; is_active: boolean }) => m.is_active && m.kind !== 'doctor').map((m: { user_id: string }) => m.user_id));
  let targets = (links ?? []).filter((l: { user_id: string }) => ok.has(l.user_id)).map((l: { tg_user_id: number; user_id: string }) => ({ tg: Number(l.tg_user_id), userId: l.user_id }));

  if (onlyTg) {
    targets = targets.filter((t) => t.tg === onlyTg);
  } else {
    const { data: sent } = await svc.from('test_shift_invites').select('tg_user_id').eq('shift_id', shift.id);
    const done = new Set((sent ?? []).map((s: { tg_user_id: number }) => Number(s.tg_user_id)));
    targets = targets.filter((t) => !done.has(t.tg));
  }

  const result: { tg: number; team: number | null; sent: boolean }[] = [];
  for (const t of targets) {
    const asg = await assignToTestShift(svc, shift, t.userId);
    if (!asg) { result.push({ tg: t.tg, team: null, sent: false }); continue; }
    const sent = await sendInvite(t.tg, asg.id, asg.team, shift.expires_at);
    if (sent && !onlyTg) await svc.from('test_shift_invites').upsert({ shift_id: shift.id, tg_user_id: t.tg, sent_at: new Date().toISOString() }, { onConflict: 'shift_id,tg_user_id' });
    result.push({ tg: t.tg, team: asg.team, sent });
    // Bot API: не більше ~30 повідомлень на секунду.
    await new Promise((r) => setTimeout(r, 60));
  }
  return json({ shift: shift.id, total: result.length, sent: result.filter((r) => r.sent).length, result });
});
