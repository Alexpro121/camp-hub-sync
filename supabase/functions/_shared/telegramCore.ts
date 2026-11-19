/**
 * Чисті помічники для Telegram-бота і входу з Mini App.
 * Без імпортів і звернень до env, тому тести завантажують модуль напряму.
 */

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type StaffKind = 'supervisor' | 'duckling' | 'doctor';
export const KIND_LABEL: Record<StaffKind, string> = { supervisor: 'Супровід', duckling: 'Каченя', doctor: 'Лікар' };
/** Короткі коди типів для callback_data (ліміт Telegram — 64 байти). */
export const KIND_CODE: Record<StaffKind, string> = { supervisor: 's', duckling: 'd', doctor: 'm' };
const CODE_KIND = new Map<string, StaffKind>([['s', 'supervisor'], ['d', 'duckling'], ['m', 'doctor']]);

const enc = new TextEncoder();

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

const toHex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type InitDataResult =
  | { ok: true; user: TgUser; authDate: number; startParam: string | null }
  | { ok: false; reason: 'missing' | 'bad_hash' | 'expired' | 'no_user' };

/**
 * Перевіряє Telegram.WebApp.initData за правилами Telegram:
 * secret = HMAC_SHA256(key="WebAppData", bot_token), hash = HMAC_SHA256(key=secret, data_check_string).
 * Підробити initData без токена бота неможливо, тож ID користувача з нього — довірений.
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86_400,
  nowMs = Date.now(),
): Promise<InitDataResult> {
  if (!initData || !botToken || initData.length > 8192) return { ok: false, reason: 'missing' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'bad_hash' };

  const fields = [...params.entries()].filter(([k]) => k !== 'hash').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const digest = async (list: [string, string][]) => toHex(await hmac(secret, list.map(([k, v]) => `${k}=${v}`).join('\n')));

  let valid = safeEqual(await digest(fields), hash);
  // Нові клієнти додають поле signature; підтримуємо обидва варіанти рядка перевірки.
  if (!valid && params.has('signature')) valid = safeEqual(await digest(fields.filter(([k]) => k !== 'signature')), hash);
  if (!valid) return { ok: false, reason: 'bad_hash' };

  const authDate = Number(params.get('auth_date'));
  const age = nowMs / 1000 - authDate;
  if (!Number.isFinite(authDate) || authDate <= 0 || age > maxAgeSec || age < -300) return { ok: false, reason: 'expired' };

  let user: TgUser | null = null;
  try { user = JSON.parse(params.get('user') ?? ''); } catch { user = null; }
  if (!user || typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, reason: 'no_user' };
  return { ok: true, user, authDate, startParam: params.get('start_param') };
}

/** Список Telegram ID адміністраторів з налаштування (через кому або пробіл). */
export function parseAdminIds(raw: string | undefined | null): Set<number> {
  const ids = new Set<number>();
  for (const part of String(raw ?? '').split(/[\s,;]+/)) {
    if (!/^\d{3,15}$/.test(part)) continue;
    const n = Number(part);
    if (Number.isSafeInteger(n) && n > 0) ids.add(n);
  }
  return ids;
}

/** Телефон у форматі +380..., так само як у staff-accounts. */
export function normPhone(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length < 9 || d.length > 15) return null;
  return '+' + (d.length === 9 ? '380' + d : d.length === 10 && d.startsWith('0') ? '38' + d : d);
}

/** ПІБ для збереження: щонайменше два слова з літер, без зайвих пробілів. */
export function cleanFullName(v: unknown): string | null {
  const s = String(v ?? '').normalize('NFC').replace(/[’ʼ`´‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > 120) return null;
  const words = s.split(' ');
  if (words.length < 2 || !words.every((w) => /\p{L}/u.test(w))) return null;
  if (/[<>@/\\{}[\]|#$%^*=+~]/.test(s) || /\d/.test(s)) return null;
  return s;
}

/** Нік Telegram без @ або null. */
export function normTgUsername(v: unknown): string | null {
  const t = String(v ?? '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(t) ? t : null;
}

export function tgDisplayName(u: Pick<TgUser, 'first_name' | 'last_name'>): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ').trim().slice(0, 120) || 'без імені';
}

/** Перше слово і ініціали ("Шевченко Т. Г."): дитина впізнає себе, а повного списку імен не видно. */
export function maskName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return '';
  return [first, ...rest.map((p) => `${p[0].toUpperCase()}.`)].join(' ');
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Команда з тексту повідомлення: "/start abc" -> "start", "/register@bot" -> "register". */
export function parseCommand(text: string | undefined): string | null {
  const m = /^\/([a-z0-9_]{1,32})(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.exec(String(text ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

export type CallbackAction =
  | { type: 'child_team'; team: number }
  | { type: 'child_yes' }
  | { type: 'child_no' }
  | { type: 'reg_kind'; kind: StaffKind }
  | { type: 'reg_approve'; id: string; kind: StaffKind }
  | { type: 'reg_reject'; id: string }
  | { type: 'rebind_approve'; id: string }
  | { type: 'rebind_reject'; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const cb = {
  childTeam: (team: number) => `ct:${team}`,
  childYes: () => 'cy',
  childNo: () => 'cn',
  regKind: (kind: StaffKind) => `rk:${KIND_CODE[kind]}`,
  regApprove: (id: string, kind: StaffKind) => `ra:${id}:${KIND_CODE[kind]}`,
  regReject: (id: string) => `rr:${id}`,
  rebindApprove: (id: string) => `ba:${id}`,
  rebindReject: (id: string) => `br:${id}`,
};

/** Розбирає callback_data. Невідомі або пошкоджені дані -> null (кнопки можна підробити). */
export function parseCallback(data: string | undefined): CallbackAction | null {
  const parts = String(data ?? '').split(':');
  switch (parts[0]) {
    case 'ct': {
      const team = Number(parts[1]);
      return parts.length === 2 && Number.isInteger(team) && team >= 1 && team <= 999 ? { type: 'child_team', team } : null;
    }
    case 'cy': return parts.length === 1 ? { type: 'child_yes' } : null;
    case 'cn': return parts.length === 1 ? { type: 'child_no' } : null;
    case 'rk': { const kind = CODE_KIND.get(parts[1]); return parts.length === 2 && kind ? { type: 'reg_kind', kind } : null; }
    case 'ra': { const kind = CODE_KIND.get(parts[2]); return parts.length === 3 && UUID.test(parts[1]) && kind ? { type: 'reg_approve', id: parts[1], kind } : null; }
    case 'rr': return parts.length === 2 && UUID.test(parts[1]) ? { type: 'reg_reject', id: parts[1] } : null;
    case 'ba': return parts.length === 2 && UUID.test(parts[1]) ? { type: 'rebind_approve', id: parts[1] } : null;
    case 'br': return parts.length === 2 && UUID.test(parts[1]) ? { type: 'rebind_reject', id: parts[1] } : null;
    default: return null;
  }
}

type InlineButton = { text: string; callback_data: string };

/** Кнопки з номерами команд, по 5 у рядку. */
export function teamKeyboard(teams: number[]): { inline_keyboard: InlineButton[][] } {
  const rows: InlineButton[][] = [];
  const sorted = [...new Set(teams)].filter((t) => Number.isInteger(t) && t >= 1 && t <= 999).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 5) {
    rows.push(sorted.slice(i, i + 5).map((t) => ({ text: String(t), callback_data: cb.childTeam(t) })));
  }
  return { inline_keyboard: rows };
}

/** Кнопки для адміна під заявкою: підтвердити з потрібним типом або відхилити. */
export function approvalKeyboard(id: string): { inline_keyboard: InlineButton[][] } {
  return {
    inline_keyboard: [
      [
        { text: '✅ Супровід', callback_data: cb.regApprove(id, 'supervisor') },
        { text: '✅ Каченя', callback_data: cb.regApprove(id, 'duckling') },
      ],
      [
        { text: '✅ Лікар', callback_data: cb.regApprove(id, 'doctor') },
        { text: '❌ Відхилити', callback_data: cb.regReject(id) },
      ],
    ],
  };
}

/** Крок діалогу вважаємо застарілим через 30 хвилин. */
export const STATE_TTL_MS = 30 * 60_000;
export function isStateFresh(updatedAt: string | null | undefined, nowMs = Date.now()): boolean {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(t) && nowMs - t < STATE_TTL_MS;
}
