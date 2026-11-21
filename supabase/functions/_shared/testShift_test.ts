import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { closesAtLabel, inviteText, pickTeam } from './testShift.ts';

Deno.test('newcomers go to the least staffed team', () => {
  assertEquals(pickTeam([1, 2, 3], []), 1);
  assertEquals(pickTeam([1, 2, 3], [1, 1, 2, 3]), 2);
  assertEquals(pickTeam([1, 2, 3], [1, 2, 3, 9, 9]), 1);
  assertEquals(pickTeam([], [1]), null);
});

Deno.test('invite names the team and the Kyiv closing time', () => {
  assertEquals(closesAtLabel('2026-11-21T21:59:00Z'), '21.11 о 23:59');
  const text = inviteText(4, '2026-11-21T21:59:00Z');
  assertStringIncludes(text, 'команді 4');
  assertStringIncludes(text, '21.11 о 23:59');
  assertStringIncludes(text, 'тестова');
});
