import { describe, expect, it } from 'vitest';
import { normalizePhone, normalizePresence } from '@/lib/importer';

describe('normalizePhone: реальні варіанти з таблиць', () => {
  it.each([
    ['0671234567', '+380671234567'],
    ['+380 (67) 123-45-67', '+380671234567'],
    ['380671234567', '+380671234567'],
    ['80671234567', '+380671234567'],
    ['671234567', '+380671234567'],
    ['067-123-45-67', '+380671234567'],
  ])('%s → %s', (input, out) => expect(normalizePhone(input)).toBe(out));

  it('кілька номерів у клітинці — береться перший', () => {
    expect(normalizePhone('0671234567, 0501234567')).toBe('+380671234567');
    expect(normalizePhone('мама 067 123 45 67 / тато 050 765 43 21')).toBe('+380671234567');
    expect(normalizePhone('0671234567\n0501234567')).toBe('+380671234567');
  });
  it('порожнє та текст без цифр', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('немає')).toBeNull();
  });
});

describe('normalizePresence', () => {
  it('розпізнає типові значення', () => {
    for (const v of ['TRUE', 'так', '+', 'Присутня', true, 'є']) expect(normalizePresence(v)).toBe(true);
    for (const v of ['FALSE', 'ні', '-', '', null, 'відсутній']) expect(normalizePresence(v)).toBe(false);
  });
});
