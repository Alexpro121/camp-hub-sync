import { describe, expect, it } from 'vitest';
import { buildIndex, searchItems } from './registrySearch';

const kids = [
  { n: "Лук'ян Шевченко Петрович", p: '+380671234567' },
  { n: 'Шевчук Олена Іванівна', p: '' },
  { n: 'Коваленко Андрій', p: '0509876543' },
  { n: 'Ковальчук Анна', p: '' },
  { n: 'Ігор Бондаренко', p: '' },
];
const find = (q: string) => searchItems(kids, (k) => buildIndex(k.n, k.p), q).map((k) => k.n);

describe('registry search', () => {
  it('any word order and partial words', () => expect(find('андр ковал')[0]).toBe('Коваленко Андрій'));
  it('apostrophe variants', () => expect(find('лукян')[0]).toBe("Лук'ян Шевченко Петрович"));
  it('typo tolerant', () => expect(find('Шевченк0 лукян')[0]).toBe("Лук'ян Шевченко Петрович"));
  it('wrong keyboard layout', () => expect(find('rjdfktyrj')[0]).toBe('Коваленко Андрій'));
  it('latin transliteration', () => expect(find('kovalenko')[0]).toBe('Коваленко Андрій'));
  it('и/і confusion', () => expect(find('игор')[0]).toBe('Ігор Бондаренко'));
  it('phone digits', () => expect(find('9876543')).toEqual(['Коваленко Андрій']));
  it('phone without country code', () => expect(find('0671234567')).toEqual(["Лук'ян Шевченко Петрович"]));
  it('phone with formatting', () => expect(find('+380 67 123 45 67')).toEqual(["Лук'ян Шевченко Петрович"]));
  it('no garbage hits', () => expect(find('зззззз')).toEqual([]));
});
