import { assertEquals } from 'jsr:@std/assert@1';
import { joinToken } from './shiftInvite.ts';

Deno.test('joinToken бере код з join_<код> і з голого коду', () => {
  assertEquals(joinToken('join_idEBtTlYFtu4JX07oZ0Voa4P'), 'idEBtTlYFtu4JX07oZ0Voa4P');
  assertEquals(joinToken('M-q72OiPf2RehAeoV1O97awH'), 'M-q72OiPf2RehAeoV1O97awH');
  assertEquals(joinToken('join_short'), null);
  assertEquals(joinToken('join_bad token with spaces!'), null);
  assertEquals(joinToken(undefined), null);
});
