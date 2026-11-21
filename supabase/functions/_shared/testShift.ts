import { admin } from './accounts.ts';
import { escapeHtml } from './telegramCore.ts';
import { tg, WEBAPP_URL } from './telegramServer.ts';

/**
 * Тестова зміна для супроводу: shifts.is_test + expires_at. Після expires_at її видаляє pg_cron
 * (private.purge_expired_test_shifts) разом із дітьми, розкладом і призначеннями.
 * Кожен працівник отримує свою команду (найменш заповнену) і запрошення з кнопкою,
 * яка одразу відкриває його команду (/staff?enter=<призначення>).
 */

type Svc = ReturnType<typeof admin>;
export interface TestShift { id: string; name: string; expires_at: string; assigned_teams: number[] | null }

const KYIV = 'Europe/Kyiv';

/** «21.11 о 23:59» за Києвом. */
export function closesAtLabel(expiresAt: string): string {
  const d = new Date(expiresAt);
  const date = d.toLocaleDateString('uk-UA', { timeZone: KYIV, day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('uk-UA', { timeZone: KYIV, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} о ${time}`;
}

/** Відкрита тестова зміна (ще не минув expires_at) або null. */
export async function liveTestShift(svc: Svc): Promise<TestShift | null> {
  const { data } = await svc.from('shifts').select('id, name, expires_at, assigned_teams')
    .eq('is_test', true).is('deleted_at', null).gt('expires_at', new Date().toISOString())
    .order('expires_at').limit(1);
  return (data?.[0] as TestShift | undefined) ?? null;
}

/** Команда з найменшою кількістю людей; при рівності — менший номер. Чиста функція (тест). */
export function pickTeam(teams: number[], taken: number[]): number | null {
  if (!teams.length) return null;
  const load = new Map(teams.map((t) => [t, 0]));
  for (const t of taken) if (load.has(t)) load.set(t, (load.get(t) ?? 0) + 1);
  return [...load.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];
}

/** Призначення працівника в тестову зміну (повторний виклик повертає наявне). */
export async function assignToTestShift(svc: Svc, shift: TestShift, userId: string): Promise<{ id: string; team: number } | null> {
  const { data: own } = await svc.from('staff_assignments').select('id, team_number').eq('shift_id', shift.id).eq('staff_user_id', userId).limit(1);
  if (own?.length) return { id: own[0].id, team: own[0].team_number };
  const { data: all } = await svc.from('staff_assignments').select('team_number').eq('shift_id', shift.id);
  const team = pickTeam([...(shift.assigned_teams ?? [])].sort((a, b) => a - b), (all ?? []).map((a: { team_number: number }) => a.team_number));
  if (team === null) return null;
  const { data: row, error } = await svc.from('staff_assignments').insert({ staff_user_id: userId, shift_id: shift.id, team_number: team }).select('id').single();
  return error || !row ? null : { id: row.id, team };
}

export function inviteText(team: number, expiresAt: string): string {
  const until = closesAtLabel(expiresAt);
  return [
    '🧪 <b>Тестова зміна відкрита!</b>',
    '',
    `Ти в <b>команді ${team}</b>. Натисни кнопку нижче — команда відкриється одразу, нічого вводити не треба.`,
    '',
    'Для тебе відкрито все: розклад (і свої події в ньому), відмітки присутності, нотатки, залізні долари, переведення дітей, сповіщення. Діти й розклад вигадані — пробуй сміливо, нічого не зламаєш 🙂',
    '',
    `⏳ Це <b>тестова</b> зміна: вона працює до кінця дня й закривається <b>${escapeHtml(until)}</b>. Після цього вона зникне автоматично разом з усіма тестовими даними.`,
    '',
    'Помітиш щось дивне — напиши адміністратору.',
  ].join('\n');
}

/** Надсилає запрошення з кнопкою, що одразу відкриває команду. */
export async function sendInvite(tgId: number, assignmentId: string, team: number, expiresAt: string): Promise<boolean> {
  const url = `${WEBAPP_URL}/staff?enter=${encodeURIComponent(assignmentId)}`;
  const res = await tg('sendMessage', {
    chat_id: tgId, text: inviteText(team, expiresAt), parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: `🧪 Відкрити команду ${team}`, web_app: { url } }]] },
  });
  return res !== null;
}

/** Після підтвердження заявки: якщо тестова зміна ще відкрита — команда й запрошення одразу. */
export async function inviteNewcomer(svc: Svc, userId: string, tgId: number): Promise<void> {
  const shift = await liveTestShift(svc);
  if (!shift) return;
  const asg = await assignToTestShift(svc, shift, userId);
  if (!asg) return;
  if (await sendInvite(tgId, asg.id, asg.team, shift.expires_at)) {
    await svc.from('test_shift_invites').upsert({ shift_id: shift.id, tg_user_id: tgId, sent_at: new Date().toISOString() }, { onConflict: 'shift_id,tg_user_id' });
  }
}
