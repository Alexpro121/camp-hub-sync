import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { admin, ANON_KEY, ensureRole, SUPABASE_URL } from './accounts.ts';
import { parseAdminIds } from './telegramCore.ts';

/** Налаштування бота (секрети функцій Supabase). */
export const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
export const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
export const WEBAPP_URL = (Deno.env.get('TELEGRAM_WEBAPP_URL') ?? '').replace(/\/+$/, '');
/** Telegram ID адміністраторів. Пароль адміна в боті не використовується. */
export const ADMIN_TG_IDS = parseAdminIds(Deno.env.get('TELEGRAM_ADMIN_IDS'));
/** Скільки секунд дійсний initData з Mini App (за замовчуванням доба). */
export const INIT_DATA_MAX_AGE = Number(Deno.env.get('TELEGRAM_INITDATA_MAX_AGE') ?? '') || 86_400;

type Svc = ReturnType<typeof admin>;

/** Виклик Bot API. Вміст повідомлень у журнал не пишемо, лише код помилки. */
export async function tg<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!body?.ok) {
      console.warn(`[telegram] ${method} failed: ${body?.error_code ?? res.status}`);
      return null;
    }
    return body.result as T;
  } catch {
    console.warn(`[telegram] ${method} network error`);
    return null;
  }
}

export type MenuRole = 'child' | 'staff' | 'admin';

/** Кнопка відкриття Mini App під повідомленням. */
export const openAppKeyboard = (text = 'Відкрити застосунок') => ({
  inline_keyboard: [[{ text, web_app: { url: WEBAPP_URL } }]],
});

const COMMANDS: Record<MenuRole, { command: string; description: string }[]> = {
  child: [{ command: 'start', description: 'Відкрити мій кабінет' }],
  staff: [{ command: 'start', description: 'Відкрити кабінет супроводу' }],
  admin: [
    { command: 'start', description: 'Відкрити застосунок' },
    { command: 'pending', description: 'Заявки на підтвердження' },
  ],
};

/**
 * Персональне меню: кнопка «Відкрити» і список команд лише для цього чату.
 * Неприв'язаний акаунт бачить загальне меню бота, де є тільки /start.
 */
export async function applyMenu(chatId: number, role: MenuRole | null): Promise<void> {
  if (!role) {
    await tg('setChatMenuButton', { chat_id: chatId, menu_button: { type: 'default' } });
    await tg('deleteMyCommands', { scope: { type: 'chat', chat_id: chatId } });
    return;
  }
  await tg('setChatMenuButton', { chat_id: chatId, menu_button: { type: 'web_app', text: 'Відкрити', web_app: { url: WEBAPP_URL } } });
  await tg('setMyCommands', { commands: COMMANDS[role], scope: { type: 'chat', chat_id: chatId } });
}

/** Чи має акаунт роль адміністратора в базі. */
export async function userIsAdmin(svc: Svc, userId: string): Promise<boolean> {
  const { data } = await svc.from('user_roles').select('id').eq('user_id', userId).eq('role', 'admin').limit(1);
  return Boolean(data?.length);
}

/**
 * Роль адміна зі списку TELEGRAM_ADMIN_IDS: видається, поки ID у списку, і забирається, коли його прибрали.
 * Роль, видану інакше (не зі списку), не чіпаємо. Повертає, чи акаунт зараз адмін.
 */
export async function syncEnvAdmin(svc: Svc, tgId: number, userId: string, kind: string, adminFromEnv: boolean): Promise<boolean> {
  if (ADMIN_TG_IDS.has(tgId) && kind !== 'doctor') {
    if (!(await userIsAdmin(svc, userId))) {
      await ensureRole(svc, userId, 'admin', { team_number: null });
      await svc.from('telegram_links').update({ admin_from_env: true }).eq('tg_user_id', tgId);
    }
    return true;
  }
  if (adminFromEnv) {
    await svc.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
    await svc.from('telegram_links').update({ admin_from_env: false }).eq('tg_user_id', tgId);
    return false;
  }
  return userIsAdmin(svc, userId);
}

/** Відкликає всі сесії акаунтів (refresh-токени), щоб старий пристрій не зберіг доступ. */
export async function revokeSessions(svc: Svc, userIds: string[]): Promise<void> {
  for (const id of new Set(userIds)) {
    const { error } = await svc.rpc('telegram_revoke_sessions', { p_user: id });
    if (error) console.warn('[telegram] session revoke failed');
  }
}

/** Внутрішні акаунти входу дитини (child-login / tg-auth). */
export async function childAuthUserIds(svc: Svc, childId: string): Promise<string[]> {
  const { data } = await svc.from('user_roles').select('user_id').eq('role', 'child').eq('child_id', childId);
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

/**
 * Сесія для акаунта супроводу без пароля: одноразове посилання, яке сервер одразу ж і підтверджує.
 * Працює незалежно від того, чи людина колись задавала пароль.
 */
export async function sessionForUser(svc: Svc, userId: string) {
  const { data: u, error: userErr } = await svc.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (userErr || !email) throw new Error('account_unavailable');
  const { data: link, error } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const hashed = link?.properties?.hashed_token;
  if (error || !hashed) throw new Error('session_failed');
  const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error: otpErr } = await pub.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (otpErr || !data?.session) throw new Error('session_failed');
  return data.session;
}
