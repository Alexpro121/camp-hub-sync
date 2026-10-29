import { expect, it } from 'vitest';
import { useTalentEventActive } from './useTalentEventActive';
it('talent evening stays disabled for all roles', () => {
  const result = useTalentEventActive();
  expect(result.active).toBe(false);
  expect(result.data).toBe(false);
  expect(result.loading).toBe(false);
});