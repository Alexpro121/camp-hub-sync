import { admin } from './accounts.ts';
import { escapeHtml } from './telegramCore.ts';
import { tg, WEBAPP_URL } from './telegramServer.ts';

/**
 * Тестова зміна для супроводу: shifts.is_test + expires_at. Після expires_at її видаляє pg_cron
 * (private.purge_expired_test_shifts) разом із дітьми, розкладом, призначеннями й посиланням зміни.
 * Запрошення веде на вибір команди (/staff?pick=<токен посилання зміни>): номер команди
 * супровід обирає сам, сервер перевіряє його через staff-accounts join_shift.
 */

type Svc = ReturnType<typeof admin>;
export interface TestShift { id: string; name: string; expires_at: string }

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
  const { data } = await svc.from('shifts').select('id, name, expires_at')
    .eq('is_test', true).is('deleted_at', null).gt('expires_at', new Date().toISOString())
    .order('expires_at').limit(1);
  return (data?.[0] as TestShift | undefined) ?? null;
}

/** Діюче посилання зміни (staff_invites) для вибору команди. */
export async function pickToken(svc: Svc, shiftId: string): Promise<string | null> {
  const { data } = await svc.from('staff_invites').select('token').eq('shift_id', shiftId).eq('revoked', false)
    .gt('expires_at', new Date().toISOString()).order('created_at').limit(1);
  return (data?.[0] as { token: string } | undefined)?.token ?? null;
}

export function inviteText(expiresAt: string): string {
  const until = closesAtLabel(expiresAt);
  return [
    '🧪 <b>Навчальна тестова зміна для супроводу</b>',
    '',
    'Ми відкрили тренувальну зміну, щоб ти спокійно спробував застосунок до справжньої зміни: подивився, як усе влаштовано, і потренувався на вигаданих дітях.',
    '',
    'Натисни кнопку нижче й обери номер своєї команди — вона одразу відкриється.',
    '',
    '<b>Що варто спробувати:</b>',
    '• відмітити присутність дітей і написати нотатку;',
    '• нарахувати залізні долари;',
    '• перевести дитину в іншу команду;',
    '• подивитися розклад і додати свою подію (система попередить, якщо вона накладається);',
    '• скопіювати розклад дня для Telegram.',
    '',
    'Діти й розклад вигадані — пробуй сміливо, нічого не зламаєш 🙂',
    '',
    `⏳ Це <b>тестова</b> зміна: вона працює до кінця дня й закривається <b>${escapeHtml(until)}</b>. Після цього вона зникне автоматично разом з усіма тестовими даними.`,
    '',
    'Помітиш щось дивне — напиши адміністратору.',
  ].join('\n');
}

/** Надсилає запрошення з кнопкою вибору команди. */
export async function sendInvite(tgId: number, token: string, expiresAt: string): Promise<boolean> {
  const url = `${WEBAPP_URL}/staff?pick=${encodeURIComponent(token)}`;
  const res = await tg('sendMessage', {
    chat_id: tgId, text: inviteText(expiresAt), parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: '🧪 Обрати команду', web_app: { url } }]] },
  });
  return res !== null;
}

/** Після підтвердження заявки: якщо тестова зміна ще відкрита — запрошення одразу. */
export async function inviteNewcomer(svc: Svc, _userId: string, tgId: number): Promise<void> {
  const shift = await liveTestShift(svc);
  if (!shift) return;
  const token = await pickToken(svc, shift.id);
  if (!token) return;
  if (await sendInvite(tgId, token, shift.expires_at)) {
    await svc.from('test_shift_invites').upsert({ shift_id: shift.id, tg_user_id: tgId, sent_at: new Date().toISOString() }, { onConflict: 'shift_id,tg_user_id' });
  }
}
