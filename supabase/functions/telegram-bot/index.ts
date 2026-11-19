import { admin, ensureRole } from '../_shared/accounts.ts';
import { kyivDate } from '../_shared/ratelimit.ts';
import { liveShiftIds, matchChild } from '../_shared/childSearch.ts';
import {
  approvalKeyboard,
  cb,
  cleanFullName,
  escapeHtml,
  isStateFresh,
  KIND_LABEL,
  maskName,
  normPhone,
  normTgUsername,
  parseCallback,
  parseCommand,
  safeEqual,
  type StaffKind,
  teamKeyboard,
  tgDisplayName,
  type TgUser,
} from '../_shared/telegramCore.ts';
import {
  ADMIN_TG_IDS,
  applyMenu,
  BOT_TOKEN,
  childAuthUserIds,
  type MenuRole,
  openAppKeyboard,
  revokeSessions,
  syncEnvAdmin,
  tg,
  WEBHOOK_SECRET,
} from '../_shared/telegramServer.ts';

/**
 * Вебхук Telegram-бота.
 *  - /start      — вхід дитини: ПІБ, команда кнопкою, підтвердження «Це ти?», прив'язка Telegram.
 *  - /register   — заявка супроводу / каченяти / лікаря; діє лише після підтвердження адміном.
 *  - /pending    — для адміна: заявки, що чекають рішення.
 * У загальному меню бота є тільки /start; /register нікому не показується.
 * Кожна дія перевіряє права за Telegram ID у базі, а не за тим, яку кнопку натиснули.
 */

type Svc = ReturnType<typeof admin>;
interface Link { tg_user_id: number; kind: 'child' | 'staff'; child_id: string | null; user_id: string | null; admin_from_env: boolean }
interface StaffRequest {
  id: string; tg_user_id: number; tg_username: string | null; tg_name: string | null;
  full_name: string; phone: string; kind: StaffKind; status: string;
}
interface ChildInfo { id: string; full_name: string; team_number: number; shift_id: string | null; deleted_at: string | null }

/** Скільки разів за 10 хвилин один Telegram може шукати себе в списку (кожен пошук і кожне «Ні»). */
const CHILD_ATTEMPT_LIMIT = 6;
const CHILD_ATTEMPT_WINDOW_MS = 10 * 60_000;

const nowIso = () => new Date().toISOString();

const send = (chatId: number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

const removeReplyKeyboard = { reply_markup: { remove_keyboard: true } };

/* ---------------------------- стан і прив'язки ---------------------------- */

async function getState(svc: Svc, tgId: number): Promise<{ step: string; data: Record<string, unknown> } | null> {
  const { data } = await svc.from('telegram_bot_state').select('step, data, updated_at').eq('tg_user_id', tgId).maybeSingle();
  if (!data || !isStateFresh(data.updated_at)) return null;
  return { step: data.step, data: (data.data ?? {}) as Record<string, unknown> };
}

async function setState(svc: Svc, tgId: number, step: string, data: Record<string, unknown> = {}) {
  await svc.from('telegram_bot_state').upsert({ tg_user_id: tgId, step, data, updated_at: nowIso() }, { onConflict: 'tg_user_id' });
}

async function clearState(svc: Svc, tgId: number) {
  await svc.from('telegram_bot_state').delete().eq('tg_user_id', tgId);
}

async function activeLink(svc: Svc, tgId: number): Promise<Link | null> {
  const { data } = await svc
    .from('telegram_links')
    .select('tg_user_id, kind, child_id, user_id, admin_from_env')
    .eq('tg_user_id', tgId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as Link | null) ?? null;
}

async function pendingRequest(svc: Svc, tgId: number): Promise<{ id: string } | null> {
  const { data } = await svc.from('telegram_staff_requests').select('id').eq('tg_user_id', tgId).eq('status', 'pending').maybeSingle();
  return data ?? null;
}

/** Активний акаунт супроводу за прив'язкою (або null, якщо вимкнено). */
async function activeStaff(svc: Svc, link: Link | null): Promise<{ userId: string; kind: string } | null> {
  if (!link || link.kind !== 'staff' || !link.user_id) return null;
  const { data } = await svc.from('staff_members').select('is_active, kind').eq('user_id', link.user_id).maybeSingle();
  return data?.is_active ? { userId: link.user_id, kind: data.kind } : null;
}

/** Адмін: Telegram ID у списку TELEGRAM_ADMIN_IDS або активний акаунт супроводу з роллю адміна. */
async function adminState(svc: Svc, link: Link | null): Promise<boolean> {
  const staff = await activeStaff(svc, link);
  if (!link || !staff) return false;
  return syncEnvAdmin(svc, link.tg_user_id, staff.userId, staff.kind, link.admin_from_env);
}

async function isAdminTg(svc: Svc, tgId: number): Promise<boolean> {
  if (ADMIN_TG_IDS.has(tgId)) return true;
  return adminState(svc, await activeLink(svc, tgId));
}

async function menuRoleOf(svc: Svc, link: Link): Promise<MenuRole | null> {
  if (link.kind === 'child') return 'child';
  if (!(await activeStaff(svc, link))) return null;
  return (await adminState(svc, link)) ? 'admin' : 'staff';
}

/** Telegram ID адміністраторів, яким можна написати: зі списку і активні акаунти з роллю адміна. */
async function adminRecipients(svc: Svc): Promise<number[]> {
  const ids = new Set<number>(ADMIN_TG_IDS);
  const { data: roles } = await svc.from('user_roles').select('user_id').eq('role', 'admin');
  const userIds = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))];
  if (userIds.length) {
    const [{ data: links }, { data: members }] = await Promise.all([
      svc.from('telegram_links').select('tg_user_id, user_id').eq('kind', 'staff').eq('status', 'active').in('user_id', userIds),
      svc.from('staff_members').select('user_id').eq('is_active', true).in('user_id', userIds),
    ]);
    const active = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
    for (const l of links ?? []) if (active.has(l.user_id)) ids.add(Number(l.tg_user_id));
  }
  return [...ids];
}

/** Telegram ID супроводу, призначеного на команду дитини в її зміні. Якщо таких немає — адміни. */
async function teamRecipients(svc: Svc, child: ChildInfo): Promise<number[]> {
  const ids = new Set<number>();
  if (child.shift_id) {
    const { data: asg } = await svc
      .from('staff_assignments')
      .select('staff_user_id')
      .eq('shift_id', child.shift_id)
      .eq('team_number', child.team_number);
    const userIds = [...new Set((asg ?? []).map((a: { staff_user_id: string }) => a.staff_user_id))];
    if (userIds.length) {
      const [{ data: links }, { data: members }] = await Promise.all([
        svc.from('telegram_links').select('tg_user_id, user_id').eq('kind', 'staff').eq('status', 'active').in('user_id', userIds),
        svc.from('staff_members').select('user_id, kind, is_active').in('user_id', userIds),
      ]);
      const ok = new Set((members ?? []).filter((m: { kind: string; is_active: boolean }) => m.is_active && m.kind !== 'doctor').map((m: { user_id: string }) => m.user_id));
      for (const l of links ?? []) if (ok.has(l.user_id)) ids.add(Number(l.tg_user_id));
    }
  }
  return ids.size ? [...ids] : adminRecipients(svc);
}

/** Чи може цей Telegram-акаунт вирішувати за команду дитини: адмін або супровід цієї команди. */
async function canDecideForChild(svc: Svc, tgId: number, child: ChildInfo): Promise<boolean> {
  if (await isAdminTg(svc, tgId)) return true;
  const staff = await activeStaff(svc, await activeLink(svc, tgId));
  if (!staff || staff.kind === 'doctor' || !child.shift_id) return false;
  const { data } = await svc
    .from('staff_assignments')
    .select('id')
    .eq('staff_user_id', staff.userId)
    .eq('shift_id', child.shift_id)
    .eq('team_number', child.team_number)
    .limit(1);
  return Boolean(data?.length);
}

async function liveShifts(svc: Svc): Promise<string[]> {
  const { data } = await svc.from('shifts').select('id, start_date, end_date, deleted_at').is('deleted_at', null);
  return liveShiftIds(data ?? [], kyivDate(), kyivDate(3));
}

async function loadChild(svc: Svc, childId: string): Promise<ChildInfo | null> {
  const { data } = await svc.from('children').select('id, full_name, team_number, shift_id, deleted_at').eq('id', childId).maybeSingle();
  return (data as ChildInfo | null) ?? null;
}

async function greetLinked(svc: Svc, chatId: number, link: Link) {
  const role = await menuRoleOf(svc, link);
  await applyMenu(chatId, role);
  if (!role) {
    await send(chatId, 'Доступ до кабінету вимкнено. Зверніться до адміністратора.');
    return;
  }
  const text = role === 'child'
    ? 'Ти вже увійшов(-ла). Натисни «Відкрити», щоб побачити свій кабінет.'
    : 'Ви вже підключені. Натисніть «Відкрити», щоб перейти в кабінет.';
  await send(chatId, text, { reply_markup: openAppKeyboard() });
}

/* -------------------------------- дитина -------------------------------- */

async function onStart(svc: Svc, user: TgUser) {
  const link = await activeLink(svc, user.id);
  if (link) { await clearState(svc, user.id); await greetLinked(svc, user.id, link); return; }
  if (await pendingRequest(svc, user.id)) {
    await send(user.id, 'Вашу заявку ще розглядає адміністратор. Бот напише, щойно її підтвердять.');
    return;
  }
  await setState(svc, user.id, 'child_name');
  await send(user.id, 'Привіт! 👋\nНапиши своє <b>прізвище та імʼя</b> так, як у списку табору.', removeReplyKeyboard);
}

/** Номери команд активних змін (усі сторінки: PostgREST віддає максимум 1000 рядків за раз). */
async function liveTeams(svc: Svc, liveIds: string[]): Promise<number[]> {
  const teams = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from('children').select('team_number').in('shift_id', liveIds).is('deleted_at', null).order('id').range(from, from + 999);
    if (error) break;
    for (const r of data ?? []) teams.add((r as { team_number: number }).team_number);
    if (!data || data.length < 1000) break;
  }
  return [...teams];
}

async function onChildName(svc: Svc, user: TgUser, text: string) {
  const name = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 120 || !/\p{L}/u.test(name)) {
    await send(user.id, 'Напиши прізвище та імʼя літерами, наприклад: <i>Шевченко Тарас</i>.');
    return;
  }
  const liveIds = await liveShifts(svc);
  if (!liveIds.length) { await send(user.id, 'Зараз немає активної зміни. Спробуй пізніше.'); return; }
  const teams = await liveTeams(svc, liveIds);
  if (!teams.length) { await send(user.id, 'Список учасників ще не завантажили. Спробуй пізніше.'); return; }
  await setState(svc, user.id, 'child_team', { name });
  await send(user.id, 'Обери номер своєї команди:', { reply_markup: teamKeyboard(teams) });
}

async function recentChildAttempts(svc: Svc, tgId: number): Promise<number> {
  const since = new Date(Date.now() - CHILD_ATTEMPT_WINDOW_MS).toISOString();
  const { count } = await svc
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('scope', 'tg-child')
    .eq('key', String(tgId))
    .gte('created_at', since);
  return count ?? 0;
}

const recordChildAttempt = (svc: Svc, tgId: number) => svc.from('login_attempts').insert({ scope: 'tg-child', key: String(tgId) });

async function onChildTeam(svc: Svc, user: TgUser, team: number, state: { data: Record<string, unknown> }) {
  const name = String(state.data.name ?? '');
  if (!name) { await onStart(svc, user); return; }
  // Ліміт рахується на Telegram-акаунт і на кожен пошук (успішний теж): перебирати список не вийде,
  // а спільний Wi-Fi табору нікому не заважає.
  if ((await recentChildAttempts(svc, user.id)) >= CHILD_ATTEMPT_LIMIT) {
    await send(user.id, 'Забагато спроб. Спробуй через 10 хвилин або підійди до свого супроводу.');
    return;
  }
  await recordChildAttempt(svc, user.id);
  const liveIds = await liveShifts(svc);
  const { data: pool } = liveIds.length
    ? await svc.from('children').select('id, full_name, team_number, shift_id').in('shift_id', liveIds).eq('team_number', team).is('deleted_at', null)
    : { data: [] };
  const result = matchChild((pool ?? []) as { id: string; full_name: string; team_number: number }[], name);

  if (result.kind === 'one') {
    await setState(svc, user.id, 'child_confirm', { childId: result.row.id, team });
    // Лише прізвище та ініціали: дитина впізнає себе, а повних імен інших бот не розкриває.
    await send(user.id, `Ти — <b>${escapeHtml(maskName(result.row.full_name))}</b>, команда ${team}?`, {
      reply_markup: { inline_keyboard: [[{ text: 'Так, це я', callback_data: cb.childYes() }, { text: 'Ні', callback_data: cb.childNo() }]] },
    });
    return;
  }
  if (result.kind === 'ambiguous') {
    await clearState(svc, user.id);
    await send(user.id, 'У цій команді кілька людей з таким іменем. Підійди, будь ласка, до свого супроводу.');
    return;
  }
  await setState(svc, user.id, 'child_name');
  await send(user.id, `Не знайшли тебе в команді ${team}. Перевір, як написане прізвище та імʼя, і надішли ще раз.`);
}

/** Прив'язка через SQL-функцію: відкликання й нова прив'язка в одній транзакції. Повертає старі Telegram ID. */
async function linkChild(svc: Svc, tgId: number, childId: string, username: string | null, name: string | null, approvedBy: number | null, replace: boolean) {
  const { data, error } = await svc.rpc('telegram_link_child', {
    p_tg: tgId, p_child: childId, p_username: username, p_name: name, p_approved_by: approvedBy, p_replace: replace,
  });
  return { old: ((data ?? []) as (number | string)[]).map(Number), error };
}

async function onChildConfirm(svc: Svc, user: TgUser, yes: boolean, state: { data: Record<string, unknown> }) {
  if (!yes) {
    await recordChildAttempt(svc, user.id);
    await setState(svc, user.id, 'child_name');
    await send(user.id, 'Добре, напиши прізвище та імʼя ще раз.');
    return;
  }
  const existing = await activeLink(svc, user.id);
  if (existing) { await clearState(svc, user.id); await greetLinked(svc, user.id, existing); return; }

  const childId = String(state.data.childId ?? '');
  const child = childId ? await loadChild(svc, childId) : null;
  const liveIds = await liveShifts(svc);
  if (!child || child.deleted_at || !child.shift_id || !liveIds.includes(child.shift_id)) {
    await setState(svc, user.id, 'child_name');
    await send(user.id, 'Не вдалося знайти профіль. Напиши прізвище та імʼя ще раз.');
    return;
  }

  const { error } = await linkChild(svc, user.id, child.id, normTgUsername(user.username), tgDisplayName(user), null, false);
  if (!error) {
    // Сесії, відкриті раніше на сайті за ПІБ і командою, більше не діють.
    await revokeSessions(svc, await childAuthUserIds(svc, child.id));
    await svc.from('children').update({ has_logged_in: true }).eq('id', child.id);
    await clearState(svc, user.id);
    await applyMenu(user.id, 'child');
    const first = escapeHtml(child.full_name.split(' ')[1] ?? child.full_name.split(' ')[0] ?? '');
    await send(user.id, `Готово, ${first}! 🎉\nТепер твій кабінет завжди відкривається кнопкою «Відкрити».`, { reply_markup: openAppKeyboard() });
    return;
  }
  // 23505 — профіль уже прив'язаний до іншого Telegram: далі рішення супроводу. Інше — збій.
  if (error.code !== '23505') {
    await clearState(svc, user.id);
    await send(user.id, 'Не вдалося увійти. Спробуй ще раз: /start');
    return;
  }

  await clearState(svc, user.id);
  const { data: created, error: reqErr } = await svc.from('telegram_rebind_requests').insert({
    child_id: child.id, tg_user_id: user.id, tg_username: normTgUsername(user.username), tg_name: tgDisplayName(user),
  }).select('id').single();
  if (reqErr || !created) {
    await send(user.id, 'Запит уже надіслано. Зачекай, поки супровід його підтвердить.');
    return;
  }
  const who = `${escapeHtml(tgDisplayName(user))}${user.username ? ` (@${escapeHtml(user.username)})` : ''}`;
  const text = `⚠️ <b>Повторний вхід</b>\n${escapeHtml(child.full_name)}, команда ${child.team_number}, намагається увійти з іншого Telegram: ${who}.\n\nПідтвердіть, лише якщо це справді дитина (наприклад, новий телефон). Попередній акаунт втратить доступ.`;
  const keyboard = { inline_keyboard: [[{ text: '✅ Переприв\'язати', callback_data: cb.rebindApprove(created.id) }, { text: '❌ Відхилити', callback_data: cb.rebindReject(created.id) }]] };
  for (const id of await teamRecipients(svc, child)) await send(id, text, { reply_markup: keyboard });
  await send(user.id, 'Цей профіль уже відкрито з іншого Telegram. Ми попросили твій супровід підтвердити вхід — бот напише, щойно буде рішення.');
}

async function onRebindDecision(svc: Svc, presser: TgUser, id: string, approve: boolean, message?: { chat: { id: number }; message_id: number }): Promise<string> {
  const { data: req } = await svc.from('telegram_rebind_requests').select('id, child_id, tg_user_id, tg_username, tg_name, status').eq('id', id).maybeSingle();
  if (!req || req.status !== 'pending') return 'Запит уже розглянуто';
  const child = await loadChild(svc, req.child_id);
  if (!child || child.deleted_at) {
    await svc.from('telegram_rebind_requests').update({ status: 'rejected', decided_at: nowIso() }).eq('id', id);
    return 'Профіль дитини не знайдено';
  }
  if (!(await canDecideForChild(svc, presser.id, child))) return 'Це рішення приймає супровід команди дитини';

  const { data: claimed } = await svc
    .from('telegram_rebind_requests')
    .update({ status: approve ? 'approved' : 'rejected', decided_by_tg: presser.id, decided_at: nowIso() })
    .eq('id', id).eq('status', 'pending').select('id');
  if (!claimed?.length) return 'Запит уже розглянуто';

  const requester = Number(req.tg_user_id);
  const closeButtons = () => message
    ? tg('editMessageReplyMarkup', { chat_id: message.chat.id, message_id: message.message_id, reply_markup: { inline_keyboard: [] } })
    : Promise.resolve(null);

  if (!approve) {
    await closeButtons();
    await send(requester, 'Супровід не підтвердив вхід. Підійди, будь ласка, до свого супроводу.');
    return 'Відхилено';
  }

  const { old, error } = await linkChild(svc, requester, child.id, req.tg_username, req.tg_name, presser.id, true);
  if (error) {
    if (String(error.message ?? '').includes('tg_already_linked')) {
      await svc.from('telegram_rebind_requests').update({ status: 'rejected' }).eq('id', id);
      await closeButtons();
      await send(requester, 'Твій Telegram уже прив\'язаний до іншого профілю, тому вхід не змінено. Підійди до свого супроводу.');
      return 'Цей Telegram уже прив\'язаний до іншого профілю';
    }
    await svc.from('telegram_rebind_requests').update({ status: 'pending', decided_by_tg: null, decided_at: null }).eq('id', id);
    return 'Не вдалося переприв\'язати, спробуйте ще раз';
  }

  await closeButtons();
  // Старий пристрій втрачає не лише кнопку, а й усі видані сесії.
  await revokeSessions(svc, await childAuthUserIds(svc, child.id));
  for (const oldId of old) {
    await applyMenu(oldId, null);
    await send(oldId, 'Твій профіль тепер відкривається з іншого Telegram-акаунта. Якщо це не ти — одразу скажи своєму супроводу.');
  }
  await applyMenu(requester, 'child');
  await send(requester, 'Супровід підтвердив вхід ✅\nНатисни «Відкрити», щоб побачити свій кабінет.', { reply_markup: openAppKeyboard() });
  await send(presser.id, `✅ ${escapeHtml(child.full_name)} тепер входить з нового Telegram.`);
  return 'Переприв\'язано';
}

/* ------------------------------ /register ------------------------------ */

async function onRegister(svc: Svc, user: TgUser) {
  const link = await activeLink(svc, user.id);
  // Акаунт дитини не може стати супроводом; не підказуємо, що така команда існує.
  if (link?.kind === 'child') { await send(user.id, 'Невідома команда. Натисни /start.'); return; }
  if (link) { await greetLinked(svc, user.id, link); return; }
  if (await pendingRequest(svc, user.id)) {
    await send(user.id, 'Ваша заявка вже на розгляді в адміністратора.');
    return;
  }
  await setState(svc, user.id, 'reg_name');
  await send(user.id, '<b>Реєстрація супроводу</b> (супровід, каченята, лікарі).\n\nНапишіть своє <b>прізвище та імʼя</b>.\nСкасувати: /cancel', removeReplyKeyboard);
}

async function askPhone(user: TgUser) {
  await send(user.id, 'Поділіться своїм номером телефону кнопкою нижче — так ми впевнимось, що це ви.', {
    reply_markup: { keyboard: [[{ text: '📱 Поділитися номером', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
  });
}

async function onRegName(svc: Svc, user: TgUser, text: string) {
  const name = cleanFullName(text);
  if (!name) { await send(user.id, 'Напишіть прізвище та імʼя повністю, наприклад: <i>Коваль Олена</i>.'); return; }
  if (ADMIN_TG_IDS.has(user.id)) {
    await setState(svc, user.id, 'reg_phone', { name, kind: 'supervisor' });
    await askPhone(user);
    return;
  }
  await setState(svc, user.id, 'reg_kind', { name });
  await send(user.id, 'Хто ви в таборі?', {
    reply_markup: {
      inline_keyboard: [[
        { text: KIND_LABEL.supervisor, callback_data: cb.regKind('supervisor') },
        { text: KIND_LABEL.duckling, callback_data: cb.regKind('duckling') },
        { text: KIND_LABEL.doctor, callback_data: cb.regKind('doctor') },
      ]],
    },
  });
}

async function onRegKind(svc: Svc, user: TgUser, kind: StaffKind, state: { data: Record<string, unknown> }) {
  const name = String(state.data.name ?? '');
  if (!name) { await onRegister(svc, user); return; }
  await setState(svc, user.id, 'reg_phone', { name, kind });
  await askPhone(user);
}

function requestText(req: StaffRequest): string {
  const who = `${escapeHtml(req.tg_name ?? '')}${req.tg_username ? ` (@${escapeHtml(req.tg_username)})` : ''}`;
  return [
    '🆕 <b>Заявка на реєстрацію</b>',
    `ПІБ: <b>${escapeHtml(req.full_name)}</b>`,
    `Обрано: ${KIND_LABEL[req.kind]}`,
    `Телефон: ${escapeHtml(req.phone)} (підтверджено Telegram)`,
    `Telegram: ${who}`,
    '',
    'Підтвердіть із потрібним типом або відхиліть:',
  ].join('\n');
}

async function onContact(svc: Svc, user: TgUser, contact: { phone_number?: string; user_id?: number }, state: { data: Record<string, unknown> }) {
  // Приймаємо лише власний номер: переслати чужий контакт не вийде.
  if (contact.user_id !== user.id) { await send(user.id, 'Надішліть, будь ласка, саме свій номер — кнопкою «Поділитися номером».'); return; }
  const phone = normPhone(contact.phone_number);
  const name = String(state.data.name ?? '');
  const kind = (['supervisor', 'duckling', 'doctor'].includes(String(state.data.kind)) ? state.data.kind : 'supervisor') as StaffKind;
  if (!phone || !name) { await onRegister(svc, user); return; }

  const { data: req, error } = await svc.from('telegram_staff_requests').insert({
    tg_user_id: user.id, tg_username: normTgUsername(user.username), tg_name: tgDisplayName(user), full_name: name, phone, kind,
  }).select('*').single();
  await clearState(svc, user.id);
  if (error || !req) { await send(user.id, 'Ваша заявка вже на розгляді в адміністратора.', removeReplyKeyboard); return; }

  // Адміністратори зі списку підтверджуються одразу і отримують роль адміна.
  if (ADMIN_TG_IDS.has(user.id)) {
    const res = await approveRequest(svc, req.id, 'supervisor', user.id, true);
    if (res.ok) {
      await applyMenu(user.id, 'admin');
      await send(user.id, '✅ Вас зареєстровано як адміністратора.', removeReplyKeyboard);
      await send(user.id, 'Натисніть «Відкрити», щоб перейти в застосунок.', { reply_markup: openAppKeyboard() });
    } else {
      await send(user.id, 'Не вдалося завершити реєстрацію. Спробуйте /register ще раз.', removeReplyKeyboard);
    }
    return;
  }

  await send(user.id, 'Дякуємо! Заявку надіслано адміністратору. Бот напише, щойно її підтвердять.', removeReplyKeyboard);
  const recipients = await adminRecipients(svc);
  if (!recipients.length) console.warn('[telegram-bot] no admin recipients configured');
  for (const id of recipients) await send(id, requestText(req as StaffRequest), { reply_markup: approvalKeyboard(req.id) });
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, '') + 'Aa1!';
}

/**
 * Логін акаунта, створеного ботом. Символ "+" не проходить перевірку логінів у staff-accounts,
 * тож зайняти такий логін через реєстрацію на сайті неможливо.
 */
const botLogin = (tgId: number) => `tg+${tgId}`;

/**
 * Підтвердження заявки. Спершу атомарно «забираємо» заявку (pending -> approved), щоб два адміни
 * не підтвердили її одночасно; якщо щось далі не вдалося — повертаємо в pending.
 * Бот завжди працює з власним акаунтом цього Telegram і ніколи не прив'язує чужий наявний акаунт:
 * дані з профілів (телефон, логін) може змінити сам власник, тож доказом особи вони не є.
 */
async function approveRequest(svc: Svc, id: string, kind: StaffKind, approverTg: number, grantAdmin: boolean): Promise<{ ok: true; req: StaffRequest } | { ok: false; error: string }> {
  if (kind === 'doctor' && grantAdmin) return { ok: false, error: 'admin_cannot_be_doctor' };
  const { data: claimed } = await svc
    .from('telegram_staff_requests')
    .update({ status: 'approved', kind, decided_by_tg: approverTg, decided_at: nowIso() })
    .eq('id', id).eq('status', 'pending').select('*');
  const req = claimed?.[0] as StaffRequest | undefined;
  if (!req) return { ok: false, error: 'already_decided' };

  try {
    const tgLink = await activeLink(svc, req.tg_user_id);
    if (tgLink?.kind === 'child') throw new Error('tg_is_child');

    const login = botLogin(req.tg_user_id);
    let userId: string | null = null;
    const { data: existing } = await svc.from('staff_members').select('user_id').eq('login', login).maybeSingle();
    if (existing) {
      userId = existing.user_id;
    } else {
      const { data: created, error } = await svc.auth.admin.createUser({ email: `staff.${login}@ironhelp.local`, password: randomPassword(), email_confirm: true });
      if (error || !created?.user) throw new Error('create_failed');
      const { error: memberErr } = await svc.from('staff_members').insert({
        user_id: created.user.id, full_name: req.full_name, login, phone: req.phone, telegram: normTgUsername(req.tg_username), kind,
      });
      if (memberErr) { await svc.auth.admin.deleteUser(created.user.id); throw new Error('create_failed'); }
      userId = created.user.id;
    }
    if (!userId) throw new Error('create_failed');
    if (kind === 'doctor') {
      const { data: adminRole } = await svc.from('user_roles').select('id').eq('user_id', userId).eq('role', 'admin').limit(1);
      if (adminRole?.length) throw new Error('admin_cannot_be_doctor');
    }

    // Повторна реєстрація того самого Telegram (після вимкнення тощо): оновлюємо дані на свіжі.
    const patch: Record<string, unknown> = { kind, is_active: true, full_name: req.full_name, phone: req.phone };
    const username = normTgUsername(req.tg_username);
    if (username) patch.telegram = username;
    await svc.from('staff_members').update(patch).eq('user_id', userId);

    // Ролі як у staff-accounts: лікар без прав супроводу, решта — супровід без команди до входу в зміну.
    if (kind === 'doctor') {
      await svc.from('user_roles').delete().eq('user_id', userId).eq('role', 'supervisor');
    } else {
      const { data: sup } = await svc.from('user_roles').select('id').eq('user_id', userId).eq('role', 'supervisor').limit(1);
      if (!sup?.length) await ensureRole(svc, userId, 'supervisor', { team_number: null });
    }

    // Прив'язка атомарно: акаунт відкривається лише з одного Telegram, попередній втрачає доступ.
    const { data: oldIds, error: linkErr } = await svc.rpc('telegram_link_staff', {
      p_tg: req.tg_user_id, p_user: userId, p_username: req.tg_username, p_name: req.tg_name, p_approved_by: approverTg,
    });
    if (linkErr) throw new Error(String(linkErr.message ?? '').includes('tg_already_linked') ? 'tg_already_linked' : 'link_failed');
    if (grantAdmin) await syncEnvAdmin(svc, req.tg_user_id, userId, kind, false);

    const old = ((oldIds ?? []) as (number | string)[]).map(Number);
    if (old.length) await revokeSessions(svc, [userId]);
    for (const oldId of old) {
      await applyMenu(oldId, null);
      await send(oldId, 'Ваш акаунт супроводу тепер відкривається з іншого Telegram.');
    }
    return { ok: true, req: { ...req, kind } };
  } catch (e) {
    await svc.from('telegram_staff_requests').update({ status: 'pending', decided_by_tg: null, decided_at: null }).eq('id', id);
    return { ok: false, error: e instanceof Error ? e.message : 'failed' };
  }
}

async function onRegDecision(svc: Svc, presser: TgUser, id: string, approve: boolean, kind: StaffKind | null, message?: { chat: { id: number }; message_id: number }): Promise<string> {
  if (!(await isAdminTg(svc, presser.id))) return 'Лише адміністратор може це підтвердити';

  if (!approve) {
    const { data: rejected } = await svc
      .from('telegram_staff_requests')
      .update({ status: 'rejected', decided_by_tg: presser.id, decided_at: nowIso() })
      .eq('id', id).eq('status', 'pending').select('tg_user_id, full_name');
    if (!rejected?.length) return 'Заявку вже розглянуто';
    if (message) await tg('editMessageReplyMarkup', { chat_id: message.chat.id, message_id: message.message_id, reply_markup: { inline_keyboard: [] } });
    await send(Number(rejected[0].tg_user_id), 'На жаль, заявку відхилено. Якщо це помилка — зверніться до адміністратора.');
    await send(presser.id, `❌ Заявку ${escapeHtml(rejected[0].full_name)} відхилено.`);
    return 'Відхилено';
  }

  const res = await approveRequest(svc, id, kind ?? 'supervisor', presser.id, false);
  if (!res.ok) {
    if (res.error === 'already_decided') return 'Заявку вже розглянуто';
    if (res.error === 'admin_cannot_be_doctor') return 'Адміністратор не може бути лікарем';
    if (res.error === 'tg_is_child') return 'Цей Telegram прив\'язаний до профілю дитини';
    if (res.error === 'tg_already_linked') return 'Цей Telegram уже прив\'язаний до іншого акаунта';
    return 'Не вдалося підтвердити, спробуйте ще раз';
  }
  if (message) await tg('editMessageReplyMarkup', { chat_id: message.chat.id, message_id: message.message_id, reply_markup: { inline_keyboard: [] } });
  const reqTg = Number(res.req.tg_user_id);
  const link = await activeLink(svc, reqTg);
  await applyMenu(reqTg, link ? await menuRoleOf(svc, link) : 'staff');
  await send(reqTg, `✅ Вас підтверджено: <b>${KIND_LABEL[res.req.kind]}</b>.\nНатисніть «Відкрити», щоб перейти в кабінет.`, { reply_markup: openAppKeyboard() });
  await send(presser.id, `✅ ${escapeHtml(res.req.full_name)} — ${KIND_LABEL[res.req.kind]}. Підтверджено.`);
  return 'Підтверджено';
}

async function onPending(svc: Svc, user: TgUser) {
  if (!(await isAdminTg(svc, user.id))) { await onUnknown(svc, user); return; }
  const { data } = await svc.from('telegram_staff_requests').select('*').eq('status', 'pending').order('created_at').limit(10);
  if (!data?.length) { await send(user.id, 'Нових заявок немає.'); return; }
  for (const req of data as StaffRequest[]) await send(user.id, requestText(req), { reply_markup: approvalKeyboard(req.id) });
}

async function onUnknown(svc: Svc, user: TgUser) {
  const link = await activeLink(svc, user.id);
  if (link) { await greetLinked(svc, user.id, link); return; }
  await send(user.id, 'Натисни /start, щоб почати.');
}

/* -------------------------------- маршрут -------------------------------- */

// deno-lint-ignore no-explicit-any
async function handleUpdate(update: any) {
  const svc = admin();

  if (update?.callback_query) {
    const q = update.callback_query;
    const user = q.from as TgUser;
    if (!user?.id || user.is_bot || q.message?.chat?.type !== 'private') {
      await tg('answerCallbackQuery', { callback_query_id: q.id });
      return;
    }
    const action = parseCallback(q.data);
    let notice: string | undefined;
    const state = await getState(svc, user.id);
    const closeButtons = () => tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });

    switch (action?.type) {
      case 'child_team':
        if (state?.step !== 'child_team') { notice = 'Почни спочатку: /start'; break; }
        await closeButtons();
        await onChildTeam(svc, user, action.team, state);
        break;
      case 'child_yes':
      case 'child_no':
        if (state?.step !== 'child_confirm') { notice = 'Почни спочатку: /start'; break; }
        await closeButtons();
        await onChildConfirm(svc, user, action.type === 'child_yes', state);
        break;
      case 'reg_kind':
        if (state?.step !== 'reg_kind') { notice = 'Почніть спочатку: /register'; break; }
        await closeButtons();
        await onRegKind(svc, user, action.kind, state);
        break;
      case 'reg_approve':
        notice = await onRegDecision(svc, user, action.id, true, action.kind, q.message);
        break;
      case 'reg_reject':
        notice = await onRegDecision(svc, user, action.id, false, null, q.message);
        break;
      case 'rebind_approve':
        notice = await onRebindDecision(svc, user, action.id, true, q.message);
        break;
      case 'rebind_reject':
        notice = await onRebindDecision(svc, user, action.id, false, q.message);
        break;
      default:
        notice = 'Кнопка застаріла';
    }
    await tg('answerCallbackQuery', { callback_query_id: q.id, ...(notice ? { text: notice } : {}) });
    return;
  }

  const msg = update?.message;
  if (!msg || msg.chat?.type !== 'private') return;
  const user = msg.from as TgUser;
  if (!user?.id || user.is_bot) return;

  const command = parseCommand(msg.text);
  if (command) {
    switch (command) {
      case 'start': await onStart(svc, user); return;
      case 'register': await onRegister(svc, user); return;
      case 'pending': await onPending(svc, user); return;
      case 'cancel':
        await clearState(svc, user.id);
        await send(user.id, 'Скасовано.', removeReplyKeyboard);
        return;
      default: await onUnknown(svc, user); return;
    }
  }

  const state = await getState(svc, user.id);
  if (msg.contact) {
    if (state?.step === 'reg_phone') await onContact(svc, user, msg.contact, state);
    else await onUnknown(svc, user);
    return;
  }
  const text = typeof msg.text === 'string' ? msg.text : '';
  if (!text) { await onUnknown(svc, user); return; }

  switch (state?.step) {
    case 'child_name': await onChildName(svc, user, text); return;
    case 'reg_name': await onRegName(svc, user, text); return;
    case 'reg_phone': await askPhone(user); return;
    case 'child_team': await send(user.id, 'Обери номер команди кнопкою вище або натисни /start, щоб почати знову.'); return;
    default: await onUnknown(svc, user);
  }
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
