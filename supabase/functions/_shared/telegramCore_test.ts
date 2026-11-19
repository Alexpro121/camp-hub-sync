import { assert, assertEquals } from 'jsr:@std/assert';
import {
  approvalKeyboard,
  cb,
  cleanFullName,
  isStateFresh,
  maskName,
  normPhone,
  parseAdminIds,
  parseCallback,
  parseCommand,
  parseStartPayload,
  teamKeyboard,
  verifyInitData,
} from './telegramCore.ts';

const TOKEN = '123456:TEST-token';
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const AUTH_DATE = Math.floor(NOW / 1000) - 60;

/** Незалежна реалізація підпису за документацією Telegram: окремо від коду, що перевіряється. */
async function sign(fields: Record<string, string>, token = TOKEN, skip: string[] = []): Promise<string> {
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', k1, enc.encode(token)));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const check = Object.keys(fields).filter((k) => !skip.includes(k)).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const hash = [...new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc.encode(check)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const baseFields = () => ({
  auth_date: String(AUTH_DATE),
  query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
  user: JSON.stringify({ id: 279058397, first_name: 'Тарас', last_name: 'Шевченко', username: 'taras_test' }),
});

Deno.test('initData: valid signature yields the Telegram user', async () => {
  const res = await verifyInitData(await sign(baseFields()), TOKEN, 86_400, NOW);
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.user.id, 279058397);
    assertEquals(res.user.username, 'taras_test');
  }
});

Deno.test('initData: tampered user id, wrong token and missing hash are rejected', async () => {
  const signed = await sign(baseFields());
  const tampered = signed.replace(encodeURIComponent('279058397'), encodeURIComponent('111111111'));
  assertEquals((await verifyInitData(tampered, TOKEN, 86_400, NOW)).ok, false);
  assertEquals((await verifyInitData(signed, '999:OTHER', 86_400, NOW)).ok, false);
  const noHash = new URLSearchParams(baseFields()).toString();
  assertEquals(await verifyInitData(noHash, TOKEN, 86_400, NOW), { ok: false, reason: 'bad_hash' });
  assertEquals(await verifyInitData('', TOKEN, 86_400, NOW), { ok: false, reason: 'missing' });
});

Deno.test('initData: stale auth_date is rejected', async () => {
  const fields = { ...baseFields(), auth_date: String(AUTH_DATE - 2 * 86_400) };
  assertEquals(await verifyInitData(await sign(fields), TOKEN, 86_400, NOW), { ok: false, reason: 'expired' });
});

Deno.test('initData: accepts both data-check variants when a signature field is present', async () => {
  const fields = { ...baseFields(), signature: 'abc_DEF-123' };
  assert((await verifyInitData(await sign(fields), TOKEN, 86_400, NOW)).ok);
  assert((await verifyInitData(await sign(fields, TOKEN, ['signature']), TOKEN, 86_400, NOW)).ok);
});

Deno.test('initData: signed data without a user is rejected', async () => {
  const fields: Record<string, string> = baseFields();
  delete fields.user;
  assertEquals(await verifyInitData(await sign(fields), TOKEN, 86_400, NOW), { ok: false, reason: 'no_user' });
});

Deno.test('callback data round-trips and rejects forged payloads', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assertEquals(parseCallback(cb.childTeam(7)), { type: 'child_team', team: 7 });
  assertEquals(parseCallback(cb.childYes()), { type: 'child_yes' });
  assertEquals(parseCallback(cb.regKind('doctor')), { type: 'reg_kind', kind: 'doctor' });
  assertEquals(parseCallback(cb.regApprove(id, 'duckling')), { type: 'reg_approve', id, kind: 'duckling' });
  assertEquals(parseCallback(cb.rebindReject(id)), { type: 'rebind_reject', id });
  for (const forged of ['ct:0', 'ct:abc', 'ct:5:1', 'ra:not-a-uuid:s', `ra:${id}:x`, 'rk:admin', 'rk:constructor', `ra:${id}:__proto__`, 'zz', '', undefined]) {
    assertEquals(parseCallback(forged as string), null, String(forged));
  }
  for (const row of approvalKeyboard(id).inline_keyboard) for (const b of row) assert(new TextEncoder().encode(b.callback_data).length <= 64);
});

Deno.test('commands, names, phones and admin ids are normalized', () => {
  assertEquals(parseCommand('/start'), 'start');
  assertEquals(parseCommand('/register@iron_bot'), 'register');
  assertEquals(parseCommand('/Start payload'), 'start');
  assertEquals(parseCommand('привіт /start'), null);
  assertEquals(cleanFullName('  Коваль   Олена '), 'Коваль Олена');
  assertEquals(cleanFullName("Лук'янов Іван"), "Лук'янов Іван");
  assertEquals(cleanFullName('Олена'), null);
  assertEquals(cleanFullName('<b>Коваль</b> Олена'), null);
  assertEquals(cleanFullName('Коваль 123'), null);
  assertEquals(normPhone('+38 (050) 123-45-67'), '+380501234567');
  assertEquals(normPhone('0501234567'), '+380501234567');
  assertEquals(normPhone('12'), null);
  assertEquals([...parseAdminIds('123456, 7890123;abc 42')], [123456, 7890123]);
});

Deno.test('team keyboard is sorted, unique and five per row', () => {
  const kb = teamKeyboard([3, 1, 2, 3, 12, 5, 4, 6, 0, 1000]);
  assertEquals(kb.inline_keyboard.map((r) => r.map((b) => b.text)), [['1', '2', '3', '4', '5'], ['6', '12']]);
});

Deno.test('conversation state expires after 30 minutes', () => {
  assert(isStateFresh(new Date(NOW - 5 * 60_000).toISOString(), NOW));
  assertEquals(isStateFresh(new Date(NOW - 31 * 60_000).toISOString(), NOW), false);
  assertEquals(isStateFresh(null, NOW), false);
});

Deno.test('masked names show the surname and initials only', () => {
  assertEquals(maskName('Шевченко Тарас Григорович'), 'Шевченко Т. Г.');
  assertEquals(maskName("  Лук'янова   марія "), "Лук'янова М.");
  assertEquals(maskName('Іван'), 'Іван');
  assertEquals(maskName(''), '');
});

Deno.test('start payload is read only from /start deep links', () => {
  assertEquals(parseStartPayload('/start reg_abc123'), 'reg_abc123');
  assertEquals(parseStartPayload('/start@iron_bot reg_abc'), 'reg_abc');
  assertEquals(parseStartPayload('/start'), null);
  assertEquals(parseStartPayload('/register reg_abc'), null);
  assertEquals(parseStartPayload('/start reg abc'), null);
  assertEquals(parseStartPayload('/start <b>x</b>'), null);
});
