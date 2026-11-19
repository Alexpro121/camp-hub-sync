import { admin, ensureRole, issueSession } from './accounts.ts';
import { ADMIN_TG_IDS, sessionForUser, userIsAdmin } from './telegramServer.ts';

/**
 * ТИМЧАСОВИЙ демо-режим /swap: адмін відкриває застосунок від імені іншої ролі,
 * щоб показати, як усе виглядає з кожного боку. Працює лише для адмінів (canSwap; перевіряють tg-auth і бот).
 * Ролі працівників — окремі демо-акаунти (логін demo+<тип>), дитина — перша дитина з бази.
 * Щоб прибрати режим: видалити цей файл, гілку swap у tg-auth і команду /swap у боті, DROP TABLE telegram_role_swaps.
 */

type Svc = ReturnType<typeof admin>;
export type SwapRole = 'child' | 'supervisor' | 'duckling' | 'doctor';
export const SWAP_LABEL: Record<SwapRole, string> = { child: 'Дитина', supervisor: 'Супровід', duckling: 'Каченя', doctor: 'Лікар' };

/**
 * Хто може користуватися /swap: адмін зі списку TELEGRAM_ADMIN_IDS або активний працівник,
 * прив'язаний до цього Telegram, з роллю адміна в базі.
 */
export async function canSwap(svc: Svc, tgId: number): Promise<boolean> {
  if (ADMIN_TG_IDS.has(tgId)) return true;
  const { data: link } = await svc.from('telegram_links').select('user_id').eq('tg_user_id', tgId).eq('kind', 'staff').eq('status', 'active').maybeSingle();
  if (!link?.user_id) return false;
  const { data: member } = await svc.from('staff_members').select('is_active').eq('user_id', link.user_id).maybeSingle();
  return Boolean(member?.is_active) && (await userIsAdmin(svc, link.user_id));
}

export async function demoChild(svc: Svc) {
  const { data } = await svc.from('children').select('id, team_number, shift_id').is('deleted_at', null).order('created_at').limit(1);
  return data?.[0] ?? null;
}

const randomPassword = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/[^A-Za-z0-9]/g, '') + 'Aa1!';

/** Демо-акаунт працівника потрібного типу; супровід і каченя прикріплюються до команди першої дитини. */
async function demoStaffUser(svc: Svc, kind: Exclude<SwapRole, 'child'>): Promise<{ userId: string; fullName: string }> {
  const login = `demo+${kind}`;
  const fullName = `Демо ${SWAP_LABEL[kind]}`;
  let { data: member } = await svc.from('staff_members').select('user_id').eq('login', login).maybeSingle();
  if (!member) {
    const { data: created, error } = await svc.auth.admin.createUser({ email: `staff.${login}@ironhelp.local`, password: randomPassword(), email_confirm: true });
    if (error || !created?.user) throw new Error('demo_create_failed');
    const { error: insErr } = await svc.from('staff_members').insert({ user_id: created.user.id, full_name: fullName, login, kind });
    if (insErr) { await svc.auth.admin.deleteUser(created.user.id); throw new Error('demo_create_failed'); }
    member = { user_id: created.user.id };
  }
  await svc.from('staff_members').update({ is_active: true, kind }).eq('user_id', member.user_id);
  if (kind === 'doctor') {
    await svc.from('user_roles').delete().eq('user_id', member.user_id).eq('role', 'supervisor');
  } else {
    const { data: sup } = await svc.from('user_roles').select('id').eq('user_id', member.user_id).eq('role', 'supervisor').limit(1);
    if (!sup?.length) await ensureRole(svc, member.user_id, 'supervisor', { team_number: null });
    const child = await demoChild(svc);
    if (child?.shift_id) {
      const { data: asg } = await svc.from('staff_assignments').select('id').eq('staff_user_id', member.user_id).eq('shift_id', child.shift_id).limit(1);
      if (!asg?.length) await svc.from('staff_assignments').insert({ staff_user_id: member.user_id, shift_id: child.shift_id, team_number: child.team_number });
    }
  }
  return { userId: member.user_id, fullName };
}

export type DemoIdentity =
  | { role: 'child'; childId: string; teamNumber: number; shiftId: string | null; session: unknown }
  | { role: 'staff'; kind: string; fullName: string; session: unknown };

/** Сесія для обраної демо-ролі або null (наприклад, у базі ще немає дітей). */
export async function demoIdentity(svc: Svc, role: SwapRole): Promise<DemoIdentity | null> {
  if (role === 'child') {
    const child = await demoChild(svc);
    if (!child) return null;
    const session = await issueSession(`child-${child.id}@ironhelp.local`, 'child', { child_id: child.id });
    return { role: 'child', childId: child.id, teamNumber: child.team_number, shiftId: child.shift_id, session };
  }
  const { userId, fullName } = await demoStaffUser(svc, role);
  return { role: 'staff', kind: role, fullName, session: await sessionForUser(svc, userId) };
}
