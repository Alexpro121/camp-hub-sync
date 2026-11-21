import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { closesAtLabel, inviteText } from './testShift.ts';

Deno.test('invite asks to pick a team and names the Kyiv closing time', () => {
  assertEquals(closesAtLabel('2026-11-21T21:59:00Z'), '21.11 о 23:59');
  const text = inviteText('2026-11-21T21:59:00Z');
  assertStringIncludes(text, 'обери номер своєї команди');
  assertStringIncludes(text, '21.11 о 23:59');
  assertStringIncludes(text, 'тестова');
});
