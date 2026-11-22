/**
 * Посилання зміни для супроводу (staff_invites з shift_id) у Telegram:
 * бот — t.me/<бот>?start=join_<код>, Mini App — /staff/join/<код>. Код той самий, що й у посиланні сайту.
 * Модуль без залежностей від інших спільних файлів, щоб його могли брати й бот, і staff-accounts.
 */

export const JOIN_PREFIX = 'join_';
const TOKEN = /^[A-Za-z0-9_-]{16,59}$/;

/** Код запрошення з «join_<код>» або з голого коду; null, якщо формат не той. */
export function joinToken(value: unknown): string | null {
  const s = String(value ?? '').trim();
  const t = s.startsWith(JOIN_PREFIX) ? s.slice(JOIN_PREFIX.length) : s;
  return TOKEN.test(t) ? t : null;
}

export interface ShiftInvite {
  inv: { id: string; kind: string; uses: number; max_uses: number | null; shift_id: string };
  shift: { id: string; name: string; is_test?: boolean | null };
}

// deno-lint-ignore no-explicit-any
type Svc = any;

/** Діюче посилання зміни: не відкликане, не прострочене, є місця, зміну не видалено. */
export async function loadShiftInvite(svc: Svc, token: string | null): Promise<ShiftInvite | null> {
  if (!token) return null;
  const { data: inv } = await svc.from('staff_invites').select('id, kind, uses, max_uses, shift_id, revoked, expires_at').eq('token', token).maybeSingle();
  if (!inv || inv.revoked || !inv.shift_id) return null;
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) return null;
  if (inv.max_uses != null && inv.uses >= inv.max_uses) return null;
  const { data: shift } = await svc.from('shifts').select('id, name, is_test, deleted_at').eq('id', inv.shift_id).maybeSingle();
  if (!shift || shift.deleted_at) return null;
  return { inv, shift };
}

let botName: string | null = null;
/** Посилання бота на реєстрацію в зміні або null, якщо бот не налаштований. */
export async function botJoinLink(token: string): Promise<string | null> {
  const key = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  if (!key) return null;
  if (!botName) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${key}/getMe`);
      const body = await res.json().catch(() => null);
      botName = typeof body?.result?.username === 'string' ? body.result.username : null;
    } catch { /* без зв'язку з Telegram — посилання лише на сайт */ }
  }
  return botName ? `https://t.me/${botName}?start=${JOIN_PREFIX}${token}` : null;
}
