import { admin } from '../_shared/accounts.ts';
import { normPhone, parseStartPayload, safeEqual, type TgUser } from '../_shared/telegramCore.ts';
import { BOT_TOKEN, registrationPayload, tg, WEBAPP_URL, WEBHOOK_SECRET } from '../_shared/telegramServer.ts';
import { canSwap, demoChild, SWAP_LABEL, type SwapRole } from '../_shared/telegramDemo.ts';

/**
 * Бот — лише оболонка для Mini App. Уся логіка (вхід дитини, реєстрація, підтвердження) — у застосунку (функція tg-app).
 * Бот уміє:
 *  - /start (і посилання реєстрації /start reg_<код>) — кнопка відкриття застосунку;
 *  - приймає номер телефону, яким користувач поділився із застосунку (лише власний номер);
 *  - /registry — кнопка стійки реєстрації, лише для працівників (дітям і стороннім — звичайна кнопка);
 *  - на все інше відповідає кнопкою «Відкрити».
 */

const openButton = (url: string, text = 'Відкрити застосунок') => ({ inline_keyboard: [[{ text, web_app: { url } }]] });
const send = (chatId: number, text: string, url = WEBAPP_URL, button?: string) =>
  tg('sendMessage', { chat_id: chatId, text, reply_markup: openButton(url, button) });

/** ТИМЧАСОВО: збереження обраної демо-ролі. «self» повертає власний акаунт адміна. */
async function answerSwap(callbackId: string, tgId: number, role: string) {
  const svc = admin();
  if (role === 'self') {
    await svc.from('telegram_role_swaps').delete().eq('tg_user_id', tgId);
    await tg('answerCallbackQuery', { callback_query_id: callbackId, text: 'Повернено ваш акаунт' });
    await send(tgId, 'Режим: ваш власний акаунт (адмін). Закрийте застосунок і відкрийте знову.');
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(SWAP_LABEL, role)) { await tg('answerCallbackQuery', { callback_query_id: callbackId }); return; }
  if (role === 'child' && !(await demoChild(svc))) {
    await tg('answerCallbackQuery', { callback_query_id: callbackId, text: 'У базі ще немає дітей — спершу завантажте список', show_alert: true });
    return;
  }
  await svc.from('telegram_role_swaps').upsert({ tg_user_id: tgId, role, updated_at: new Date().toISOString() }, { onConflict: 'tg_user_id' });
  await tg('answerCallbackQuery', { callback_query_id: callbackId, text: `Режим: ${SWAP_LABEL[role as SwapRole]}` });
  await send(tgId, `Демо-режим: ${SWAP_LABEL[role as SwapRole]}. Закрийте застосунок (якщо відкритий) і відкрийте знову. Повернутись: /swap → «Я (адмін)».`);
}

/** Активний працівник (супровід, каченя, лікар або адмін), прив'язаний до цього Telegram. */
async function isActiveStaff(tgId: number): Promise<boolean> {
  const svc = admin();
  const { data: link } = await svc.from('telegram_links').select('user_id').eq('tg_user_id', tgId).eq('kind', 'staff').eq('status', 'active').maybeSingle();
  if (!link?.user_id) return false;
  const { data: member } = await svc.from('staff_members').select('is_active').eq('user_id', link.user_id).maybeSingle();
  return Boolean(member?.is_active);
}

// deno-lint-ignore no-explicit-any
async function handleUpdate(update: any) {
  if (update?.callback_query) {
    const q = update.callback_query;
    const role = String(q.data ?? '').startsWith('swap:') ? String(q.data).slice(5) : null;
    // ТИМЧАСОВО: вибір ролі для демо (/swap) — лише адміни.
    if (role && Number.isSafeInteger(q.from?.id) && (await canSwap(admin(), q.from.id))) {
      await answerSwap(q.id, q.from.id, role);
      return;
    }
    // Старі кнопки під повідомленнями: просто закриваємо «годинник».
    await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Відкрийте застосунок' });
    return;
  }
  const msg = update?.message;
  if (!msg || msg.chat?.type !== 'private') return;
  const user = msg.from as TgUser;
  if (!user?.id || user.is_bot) return;

  // Номер телефону з Mini App (Telegram.WebApp.requestContact): приймаємо лише власний.
  if (msg.contact) {
    const phone = msg.contact.user_id === user.id ? normPhone(msg.contact.phone_number) : null;
    if (!phone) {
      await send(user.id, 'Потрібен саме ваш номер. Поверніться в застосунок і натисніть «Поділитися номером».');
      return;
    }
    await admin().from('telegram_bot_state').upsert(
      { tg_user_id: user.id, step: 'contact', data: { phone }, updated_at: new Date().toISOString() },
      { onConflict: 'tg_user_id' },
    );
    await send(user.id, 'Номер отримано ✅ Поверніться в застосунок, щоб завершити реєстрацію.');
    return;
  }

  // ТИМЧАСОВО: /swap — демо від імені будь-якої ролі, лише для адмінів. Працівнику-не-адміну пояснюємо, решті — привітання.
  const isSwapCmd = /^\/swap(?:@[A-Za-z0-9_]+)?\s*$/i.test(String(msg.text ?? '').trim());
  const swapAllowed = isSwapCmd && (await canSwap(admin(), user.id));
  if (isSwapCmd && !swapAllowed && (await isActiveStaff(user.id))) {
    await send(user.id, `Команда /swap доступна лише адміністратору. Ваш Telegram ID: ${user.id}`);
    return;
  }
  if (swapAllowed) {
    await tg('sendMessage', {
      chat_id: user.id,
      text: 'Демо-режим: від чийого імені відкрити застосунок?',
      reply_markup: { inline_keyboard: [
        [{ text: '👦 Дитина', callback_data: 'swap:child' }, { text: '🧑‍🏫 Супровід', callback_data: 'swap:supervisor' }],
        [{ text: '🐥 Каченя', callback_data: 'swap:duckling' }, { text: '🩺 Лікар', callback_data: 'swap:doctor' }],
        [{ text: '👑 Я (адмін)', callback_data: 'swap:self' }],
      ] },
    });
    return;
  }

  // /registry — стійка реєстрації в застосунку, лише для активних працівників (не дітей).
  if (/^\/registry(?:@[A-Za-z0-9_]+)?\s*$/i.test(String(msg.text ?? '').trim())) {
    if (await isActiveStaff(user.id)) {
      await send(user.id, 'Стійка реєстрації дітей. Натисніть кнопку нижче.', `${WEBAPP_URL}/registry`, 'Стійка реєстрації');
      return;
    }
  }

  // Посилання реєстрації працівників веде в застосунок з кодом; усе інше — звичайне відкриття.
  const payload = parseStartPayload(msg.text);
  const expected = await registrationPayload();
  if (payload && expected && safeEqual(payload, expected)) {
    await send(user.id, 'Реєстрація для супроводу, каченят і лікарів. Натисніть кнопку нижче.', `${WEBAPP_URL}/?reg=${encodeURIComponent(payload)}`, 'Зареєструватися');
    return;
  }
  await send(user.id, 'Вітаємо в «Залізній Зміні»! 👋\nНатисніть «Відкрити застосунок» — усе відбувається там.');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  // Telegram надсилає секрет, заданий у setWebhook; без нього запит не від Telegram.
  const secret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!BOT_TOKEN || !WEBHOOK_SECRET || !safeEqual(secret, WEBHOOK_SECRET)) return new Response('unauthorized', { status: 401 });
  const update = await req.json().catch(() => null);
  try {
    await handleUpdate(update);
  } catch (e) {
    console.error('[telegram-bot] update failed:', e instanceof Error ? e.message : 'unknown');
  }
  // Завжди 200: інакше Telegram повторюватиме те саме оновлення.
  return new Response('ok');
});
