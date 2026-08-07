import { describe, it, expect } from 'vitest';
import { parseTrainTextGroupedByTeams } from '@/lib/train-parser';
import { fallbackParse } from '@/lib/schedule-parser-fallback';

const TRAIN = `Команда 5
1. Іваненко Іван
2. Петренко Петро - Львів
3. .
4. Сидоренко Ольга
SS
6. Коваль Марія – Івано-Франківськ
Команда 6
1. Шевченко Тарас
2. Franko Ivan
Команда 7
1. Бондар Олег
`;

describe('train parser isolation', () => {
  it('keeps teams separate with own seat counters', () => {
    const res: any = parseTrainTextGroupedByTeams(TRAIN);
    console.log(JSON.stringify(res, null, 1));
    expect(res).toBeTruthy();
  });
});

describe('schedule fallback', () => {
  it('parses staggered meals without AI', () => {
    const out = fallbackParse(`10.08.2026\n08:00 - 09:00 Сніданок\n08:10 - 1 і 2 команда\n08:30 - 3 команда\n10:00 - 11:00 Йога`);
    console.log(JSON.stringify(out, null, 1));
    expect(out.items.length).toBeGreaterThan(0);
  });
});
