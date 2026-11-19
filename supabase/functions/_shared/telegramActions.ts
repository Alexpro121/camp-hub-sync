import { admin, ensureRole, SERVICE_KEY } from './accounts.ts';
import { kyivDate } from './ratelimit.ts';
import { liveShiftIds, matchChild } from './childSearch.ts';
import { escapeHtml, KIND_LABEL, maskName, normTgUsername, safeEqual, type StaffKind, tgDisplayName, type TgUser } from './telegramCore.ts';
import { ADMIN_TG_IDS, childAuthUserIds, openAppKeyboard, revokeSessions, syncEnvAdmin, tg, userIsAdmin } from './telegramServer.ts';

/**
 * Уся логіка входу через Telegram, яку викликає Mini App (функція tg-app).
 * Бот — лише оболонка: відкриває застосунок, приймає номер телефону і надсилає сповіщення.
 * Кожна дія перевіряє права за Telegram ID у базі.
 */

export type Svc = ReturnType<typeof admin>;
export interface Link { tg_user_id: number; kind: 'child' | 'staff'; child_id: string | null; user_id: string | null; admin_from_env: boolean }
export interface StaffRequest {
  id: string; tg_user_id: number; tg_username: string | null; tg_name: string | null;
  full_name: string; phone: string; kind: StaffKind; status: string; created_at?: string;
}
interface ChildInfo { id: string; full_name: string; team_number: number; shift_id: string | null; deleted_at: string | null }

const CHILD_ATTEMPT_LIMIT = 6;
const CHILD_ATTEMPT_WINDOW_MS = 10 * 60_000;
const TICKET_TTL_MS = 10 * 60_000;
const nowIso = () => new Date().toISOString();

/** Повідомлення від бота з кнопкою відкриття застосунку (сповіщення). */
export const notify = (chatId: number, text: string) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: openAppKeyboard() });

/* ------------------------------ прив'язки й права ------------------------------ */

export async function activeLink(svc: Svc, tgId: number): Promise<Link | null> {
  const { data } = await svc.from('telegram_links').select('tg_user_id, kind, child_id, user_id, admin_from_env')
    .eq('tg_user_id', tgId).eq('status', 'active').maybeSingle();
  return (data as Link | null) ?? null;
}

async function activeStaff(svc: Svc, link: Link | null): Promise<{ userId: string; kind: string } | null> {
  if (!link || link.kind !== 'staff' || !link.user_id) return null;
  const { data } = await svc.from('staff_members').select('is_active, kind').eq('user_id', link.user_id).maybeSingle();
  return data?.is_active ? { userId: link.user_id, kind: data.kind } : null;
}

export async function isAdminTg(svc: Svc, tgId: number): Promise<boolean> {
  if (ADMIN_TG_IDS.has(tgId)) return true;
  const link = await activeLink(svc, tgId);
  const staff = await activeStaff(svc, link);
  return link && staff ? syncEnvAdmin(svc, tgId, staff.userId, staff.kind, link.admin_from_env) : false;
}

/** Telegram ID активних адміністраторів (зі списку і з роллю в базі). */
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

/** Супровід (не лікарі), призначений на команду дитини в її зміні: user_id і Telegram ID. */
async function teamStaff(svc: Svc, shiftId: string | null, team: number): Promise<{ userIds: string[]; tgIds: number[] }> {
  if (!shiftId) return { userIds: [], tgIds: [] };
  const { data: asg } = await svc.from('staff_assignments').select('staff_user_id').eq('shift_id', shiftId).eq('team_number', team);
  const userIds = [...new Set((asg ?? []).map((a: { staff_user_id: string }) => a.staff_user_id))];
  if (!userIds.length) return { userIds: [], tgIds: [] };
  const [{ data: links }, { data: members }] = await Promise.all([
    svc.from('telegram_links').select('tg_user_id, user_id').eq('kind', 'staff').eq('status', 'active').in('user_id', userIds),
    svc.from('staff_members').select('user_id, kind, is_active').in('user_id', userIds),
  ]);
  const ok = new Set((members ?? []).filter((m: { kind: string; is_active: boolean }) => m.is_active && m.kind !== 'doctor').map((m: { user_id: string }) => m.user_id));
  return { userIds: [...ok], tgIds: (links ?? []).filter((l: { user_id: string }) => ok.has(l.user_id)).map((l: { tg_user_id: number }) => Number(l.tg_user_id)) };
}

async function canDecideForChild(svc: Svc, tgId: number, child: ChildInfo): Promise<boolean> {
  if (await isAdminTg(svc, tgId)) return true;
  const staff = await activeStaff(svc, await activeLink(svc, tgId));
  if (!staff || staff.kind === 'doctor') return false;
  return (await teamStaff(svc, child.shift_id, child.team_number)).userIds.includes(staff.userId);
}

/* ------------------------------------ дитина ------------------------------------ */

async function liveShifts(svc: Svc): Promise<string[]> {
  const { data } = await svc.from('shifts').select('id, start_date, end_date, deleted_at').is('deleted_at', null);
  return liveShiftIds(data ?? [], kyivDate(), kyivDate(3));
}

async function loadChild(svc: Svc, childId: string): Promise<ChildInfo | null> {
  const { data } = await svc.from('children').select('id, full_name, team_number, shift_id, deleted_at').eq('id', childId).maybeSingle();
  return (data as ChildInfo | null) ?? null;
}

/** Номери команд активних змін (усі сторінки: PostgREST віддає максимум 1000 рядків за раз). */
export async function childTeams(svc: Svc): Promise<number[]> {
  const liveIds = await liveShifts(svc);
  const teams = new Set<number>();
  if (!liveIds.length) return [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from('children').select('team_number').in('shift_id', liveIds).is('deleted_at', null).order('id').range(from, from + 999);
    if (error) break;
    for (const r of data ?? []) teams.add((r as { team_number: number }).team_number);
    if (!data || data.length < 1000) break;
  }
  return [...teams].sort((a, b) => a - b);
}

async function recentAttempts(svc: Svc, tgId: number): Promise<number> {
  const since = new Date(Date.now() - CHILD_ATTEMPT_WINDOW_MS).toISOString();
  const { count } = await svc.from('login_attempts').select('id', { count: 'exact', head: true })
    .eq('scope', 'tg-child').eq('key', String(tgId)).gte('created_at', since);
  return count ?? 0;
}
export const recordChildAttempt = (svc: Svc, tgId: number) => svc.from('login_attempts').insert({ scope: 'tg-child', key: String(tgId) });

async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Квиток «знайдено» прив'язаний до Telegram ID: його не можна використати з іншого акаунта. */
async function makeTicket(tgId: number, childId: string): Promise<string> {
  const exp = Date.now() + TICKET_TTL_MS;
  return `${childId}.${exp}.${await hmacHex(`tg-child:${tgId}:${childId}:${exp}`)}`;
}
async function readTicket(tgId: number, ticket: string): Promise<string | null> {
  const [childId, expStr, sig] = String(ticket ?? '').split('.');
  const exp = Number(expStr);
  if (!childId || !sig || !exp || exp < Date.now()) return null;
  return safeEqual(sig, await hmacHex(`tg-child:${tgId}:${childId}:${exp}`)) ? childId : null;
}

export type ChildSearchResult =
  | { state: 'found'; masked: string; team: number; ticket: string }
  | { state: 'not_found' | 'ambiguous' | 'too_many' | 'no_shift' | 'already_linked' };

/** Пошук себе в списку: лише прізвище й ініціали у відповіді; кожен пошук іде в ліміт спроб. */
export async function childSearch(svc: Svc, user: TgUser, rawName: string, team: number): Promise<ChildSearchResult> {
  if (await activeLink(svc, user.id)) return { state: 'already_linked' };
  const name = String(rawName ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 120 || !Number.isInteger(team) || team < 1 || team > 999) return { state: 'not_found' };
  if ((await recentAttempts(svc, user.id)) >= CHILD_ATTEMPT_LIMIT) return { state: 'too_many' };
  await recordChildAttempt(svc, user.id);
  const liveIds = await liveShifts(svc);
  if (!liveIds.length) return { state: 'no_shift' };
  const { data: pool } = await svc.from('children').select('id, full_name, team_number').in('shift_id', liveIds).eq('team_number', team).is('deleted_at', null);
  const res = matchChild((pool ?? []) as { id: string; full_name: string; team_number: number }[], name);
  if (res.kind === 'ambiguous') return { state: 'ambiguous' };
  if (res.kind === 'none') return { state: 'not_found' };
  return { state: 'found', masked: maskName(res.row.full_name), team, ticket: await makeTicket(user.id, res.row.id) };
}

async function linkChild(svc: Svc, tgId: number, childId: string, username: string | null, name: string | null, approvedBy: number | null, replace: boolean) {
  const { data, error } = await svc.rpc('telegram_link_child', {
    p_tg: tgId, p_child: childId, p_username: username, p_name: name, p_approved_by: approvedBy, p_replace: replace,
  });
  return { old: ((data ?? []) as (number | string)[]).map(Number), error };
}

/** «Так, це я»: прив'язка, а якщо профіль уже відкрито з іншого Telegram — запит супроводу. */
export async function childConfirm(svc: Svc, user: TgUser, ticket: string): Promise<{ state: 'linked' | 'rebind_pending' | 'already_requested' | 'expired' | 'error' }> {
  if (await activeLink(svc, user.id)) return { state: 'linked' };
  const childId = await readTicket(user.id, ticket);
  if (!childId) return { state: 'expired' };
  const child = await loadChild(svc, childId);
  const liveIds = await liveShifts(svc);
  if (!child || child.deleted_at || !child.shift_id || !liveIds.includes(child.shift_id)) return { state: 'expired' };

  const { error } = await linkChild(svc, user.id, child.id, normTgUsername(user.username), tgDisplayName(user), null, false);
  if (!error) {
    // Сесії, відкриті раніше на сайті за ПІБ і командою, більше не діють.
    await revokeSessions(svc, await childAuthUserIds(svc, child.id));
    await svc.from('children').update({ has_logged_in: true }).eq('id', child.id);
    return { state: 'linked' };
  }
  if (error.code !== '23505') return { state: 'error' };

  const { error: reqErr } = await svc.from('telegram_rebind_requests').insert({
    child_id: child.id, tg_user_id: user.id, tg_username: normTgUsername(user.username), tg_name: tgDisplayName(user),
  });
  if (reqErr) return { state: 'already_requested' };
  const { tgIds } = await teamStaff(svc, child.shift_id, child.team_number);
  const recipients = tgIds.length ? tgIds : await adminRecipients(svc);
  for (const id of recipients) {
    await notify(id, `⚠️ <b>Повторний вхід</b>\n${escapeHtml(child.full_name)}, команда ${child.team_number}, намагається увійти з іншого Telegram. Підтвердіть або відхиліть у застосунку.`);
  }
  return { state: 'rebind_pending' };
}

export interface RebindItem { id: string; child_name: string; team_number: number; tg_name: string | null; tg_username: string | null; created_at: string }

/** Запити на переприв'язку, які цей Telegram може вирішувати (адмін — усі). */
export async function rebindList(svc: Svc, tgId: number): Promise<RebindItem[]> {
  const { data } = await svc.from('telegram_rebind_requests')
    .select('id, child_id, tg_name, tg_username, created_at, children(full_name, team_number, shift_id, deleted_at)')
    .eq('status', 'pending').order('created_at').limit(50);
  const out: RebindItem[] = [];
  type Row = { id: string; child_id: string; tg_name: string | null; tg_username: string | null; created_at: string; children: ChildInfo | ChildInfo[] | null };
  for (const r of (data ?? []) as unknown as Row[]) {
    const c = Array.isArray(r.children) ? r.children[0] : r.children;
    if (!c || c.deleted_at) continue;
    if (!(await canDecideForChild(svc, tgId, { ...c, id: r.child_id }))) continue;
    out.push({ id: r.id, child_name: c.full_name, team_number: c.team_number, tg_name: r.tg_name, tg_username: r.tg_username, created_at: r.created_at });
  }
  return out;
}

export async function rebindDecide(svc: Svc, presser: TgUser, id: string, approve: boolean): Promise<{ ok: boolean; message: string }> {
  const { data: req } = await svc.from('telegram_rebind_requests').select('id, child_id, tg_user_id, tg_username, tg_name, status').eq('id', id).maybeSingle();
  if (!req || req.status !== 'pending') return { ok: false, message: 'Запит уже розглянуто' };
  const child = await loadChild(svc, req.child_id);
  if (!child || child.deleted_at) {
    await svc.from('telegram_rebind_requests').update({ status: 'rejected', decided_at: nowIso() }).eq('id', id);
    return { ok: false, message: 'Профіль дитини не знайдено' };
  }
  if (!(await canDecideForChild(svc, presser.id, child))) return { ok: false, message: 'Це рішення приймає супровід команди дитини' };
  const { data: claimed } = await svc.from('telegram_rebind_requests')
    .update({ status: approve ? 'approved' : 'rejected', decided_by_tg: presser.id, decided_at: nowIso() })
    .eq('id', id).eq('status', 'pending').select('id');
  if (!claimed?.length) return { ok: false, message: 'Запит уже розглянуто' };

  const requester = Number(req.tg_user_id);
  if (!approve) {
    await notify(requester, 'Супровід не підтвердив вхід. Підійди, будь ласка, до свого супроводу.');
    return { ok: true, message: 'Відхилено' };
  }
  const { old, error } = await linkChild(svc, requester, child.id, req.tg_username, req.tg_name, presser.id, true);
  if (error) {
    if (String(error.message ?? '').includes('tg_already_linked')) {
      await svc.from('telegram_rebind_requests').update({ status: 'rejected' }).eq('id', id);
      await notify(requester, 'Твій Telegram уже прив\'язаний до іншого профілю, тому вхід не змінено. Підійди до свого супроводу.');
      return { ok: false, message: 'Цей Telegram уже прив\'язаний до іншого профілю' };
    }
    await svc.from('telegram_rebind_requests').update({ status: 'pending', decided_by_tg: null, decided_at: null }).eq('id', id);
    return { ok: false, message: 'Не вдалося переприв\'язати, спробуйте ще раз' };
  }
  // Старий пристрій втрачає всі видані сесії.
  await revokeSessions(svc, await childAuthUserIds(svc, child.id));
  for (const oldId of old) await notify(oldId, 'Твій профіль тепер відкривається з іншого Telegram-акаунта. Якщо це не ти — одразу скажи своєму супроводу.');
  await notify(requester, 'Супровід підтвердив вхід ✅ Відкрий застосунок.');
  return { ok: true, message: 'Переприв\'язано' };
}

/* ------------------------------- реєстрація працівників ------------------------------- */

/** Номер телефону, який бот щойно отримав від цього ж Telegram (кнопка «Поділитися номером»). */
export async function verifiedPhone(svc: Svc, tgId: number): Promise<string | null> {
  const { data } = await svc.from('telegram_bot_state').select('step, data, updated_at').eq('tg_user_id', tgId).maybeSingle();
  if (!data || data.step !== 'contact') return null;
  if (Date.now() - Date.parse(data.updated_at) > 30 * 60_000) return null;
  const phone = (data.data as { phone?: string } | null)?.phone;
  return typeof phone === 'string' ? phone : null;
}

const randomPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, '') + 'Aa1!';
};
/** Логін акаунта, створеного ботом: "+" не проходить перевірку логінів на сайті, тож його не зайняти. */
const botLogin = (tgId: number) => `tg+${tgId}`;

/**
 * Підтвердження заявки. Спершу атомарно «забираємо» заявку (pending -> approved); якщо далі збій — повертаємо в pending.
 * Бот завжди працює з власним акаунтом цього Telegram і не прив'язує наявні акаунти з сайту.
 */
export async function approveRequest(svc: Svc, id: string, kind: StaffKind, approverTg: number, grantAdmin: boolean): Promise<{ ok: true; req: StaffRequest } | { ok: false; error: string }> {
  if (kind === 'doctor' && grantAdmin) return { ok: false, error: 'admin_cannot_be_doctor' };
  const { data: claimed } = await svc.from('telegram_staff_requests')
    .update({ status: 'approved', kind, decided_by_tg: approverTg, decided_at: nowIso() })
    .eq('id', id).eq('status', 'pending').select('*');
  const req = claimed?.[0] as StaffRequest | undefined;
  if (!req) return { ok: false, error: 'already_decided' };
  try {
    if ((await activeLink(svc, req.tg_user_id))?.kind === 'child') throw new Error('tg_is_child');
    const login = botLogin(req.tg_user_id);
    let userId: string | null = null;
    const { data: existing } = await svc.from('staff_members').select('user_id').eq('login', login).maybeSingle();
    if (existing) userId = existing.user_id;
    else {
      const { data: created, error } = await svc.auth.admin.createUser({ email: `staff.${login}@ironhelp.local`, password: randomPassword(), email_confirm: true });
      if (error || !created?.user) throw new Error('create_failed');
      const { error: memberErr } = await svc.from('staff_members').insert({
        user_id: created.user.id, full_name: req.full_name, login, phone: req.phone, telegram: normTgUsername(req.tg_username), kind,
      });
      if (memberErr) { await svc.auth.admin.deleteUser(created.user.id); throw new Error('create_failed'); }
      userId = created.user.id;
    }
    if (!userId) throw new Error('create_failed');
    if (kind === 'doctor' && (await userIsAdmin(svc, userId))) throw new Error('admin_cannot_be_doctor');
    const patch: Record<string, unknown> = { kind, is_active: true, full_name: req.full_name, phone: req.phone };
    const username = normTgUsername(req.tg_username);
    if (username) patch.telegram = username;
    await svc.from('staff_members').update(patch).eq('user_id', userId);
    // Ролі як у staff-accounts: лікар без прав супроводу, решта — супровід без команди до входу в зміну.
    if (kind === 'doctor') await svc.from('user_roles').delete().eq('user_id', userId).eq('role', 'supervisor');
    else {
      const { data: sup } = await svc.from('user_roles').select('id').eq('user_id', userId).eq('role', 'supervisor').limit(1);
      if (!sup?.length) await ensureRole(svc, userId, 'supervisor', { team_number: null });
    }
    const { data: oldIds, error: linkErr } = await svc.rpc('telegram_link_staff', {
      p_tg: req.tg_user_id, p_user: userId, p_username: req.tg_username, p_name: req.tg_name, p_approved_by: approverTg,
    });
    if (linkErr) throw new Error(String(linkErr.message ?? '').includes('tg_already_linked') ? 'tg_already_linked' : 'link_failed');
    if (grantAdmin) await syncEnvAdmin(svc, req.tg_user_id, userId, kind, false);
    const old = ((oldIds ?? []) as (number | string)[]).map(Number);
    if (old.length) await revokeSessions(svc, [userId]);
    for (const oldId of old) await notify(oldId, 'Ваш акаунт супроводу тепер відкривається з іншого Telegram.');
    return { ok: true, req: { ...req, kind } };
  } catch (e) {
    await svc.from('telegram_staff_requests').update({ status: 'pending', decided_by_tg: null, decided_at: null }).eq('id', id);
    return { ok: false, error: e instanceof Error ? e.message : 'failed' };
  }
}

export type RegisterResult = { state: 'pending' | 'approved' | 'need_phone' | 'invalid_name' | 'already_pending' | 'linked' | 'error' };

/** Заявка з Mini App: ПІБ і тип з форми, телефон — лише підтверджений Telegram. */
export async function registerStaff(svc: Svc, user: TgUser, fullName: string, kind: StaffKind): Promise<RegisterResult> {
  if (await activeLink(svc, user.id)) return { state: 'linked' };
  const phone = await verifiedPhone(svc, user.id);
  if (!phone) return { state: 'need_phone' };
  const isEnvAdmin = ADMIN_TG_IDS.has(user.id);
  const { data: req, error } = await svc.from('telegram_staff_requests').insert({
    tg_user_id: user.id, tg_username: normTgUsername(user.username), tg_name: tgDisplayName(user),
    full_name: fullName, phone, kind: isEnvAdmin ? 'supervisor' : kind,
  }).select('*').single();
  if (error || !req) return { state: 'already_pending' };
  await svc.from('telegram_bot_state').delete().eq('tg_user_id', user.id);

  if (isEnvAdmin) {
    const res = await approveRequest(svc, req.id, 'supervisor', user.id, true);
    return { state: res.ok ? 'approved' : 'error' };
  }
  for (const id of await adminRecipients(svc)) {
    await notify(id, `🆕 Нова заявка на реєстрацію: <b>${escapeHtml(fullName)}</b> (${KIND_LABEL[req.kind as StaffKind]}). Підтвердіть у застосунку: розділ «Супровід».`);
  }
  return { state: 'pending' };
}

export async function pendingRequests(svc: Svc): Promise<StaffRequest[]> {
  const { data } = await svc.from('telegram_staff_requests').select('*').eq('status', 'pending').order('created_at').limit(50);
  return (data ?? []) as StaffRequest[];
}

export async function decideRequest(svc: Svc, presser: TgUser, id: string, approve: boolean, kind: StaffKind): Promise<{ ok: boolean; message: string }> {
  if (!approve) {
    const { data: rejected } = await svc.from('telegram_staff_requests')
      .update({ status: 'rejected', decided_by_tg: presser.id, decided_at: nowIso() })
      .eq('id', id).eq('status', 'pending').select('tg_user_id');
    if (!rejected?.length) return { ok: false, message: 'Заявку вже розглянуто' };
    await notify(Number(rejected[0].tg_user_id), 'На жаль, заявку відхилено. Якщо це помилка — зверніться до адміністратора.');
    return { ok: true, message: 'Відхилено' };
  }
  const res = await approveRequest(svc, id, kind, presser.id, false);
  if (!res.ok) {
    const map: Record<string, string> = {
      already_decided: 'Заявку вже розглянуто',
      admin_cannot_be_doctor: 'Адміністратор не може бути лікарем',
      tg_is_child: 'Цей Telegram прив\'язаний до профілю дитини',
      tg_already_linked: 'Цей Telegram уже прив\'язаний до іншого акаунта',
    };
    return { ok: false, message: map[res.error] ?? 'Не вдалося підтвердити, спробуйте ще раз' };
  }
  await notify(Number(res.req.tg_user_id), `✅ Вас підтверджено: <b>${KIND_LABEL[res.req.kind]}</b>. Відкрийте застосунок.`);
  return { ok: true, message: 'Підтверджено' };
}
