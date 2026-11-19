import { assertEquals } from 'jsr:@std/assert';
import { liveShiftIds, matchChild } from './childSearch.ts';

const pool = [
  { id: 'a', full_name: 'Шевченко Тарас Григорович' },
  { id: 'b', full_name: "Лук'янова Марія" },
  { id: 'c', full_name: 'Коваль Олена' },
  { id: 'd', full_name: 'Коваль Олена' },
  { id: 'e', full_name: 'Іван' },
];

Deno.test('exact and typo-tolerant matches find exactly one child', () => {
  assertEquals(matchChild(pool, 'Шевченко Тарас Григорович'), { kind: 'one', row: pool[0] });
  assertEquals(matchChild(pool, 'шевченко тарас григорович'), { kind: 'one', row: pool[0] });
  assertEquals(matchChild(pool, 'Шевченко Тарас'), { kind: 'one', row: pool[0] });
  assertEquals(matchChild(pool, 'Лукьянова Марія'), { kind: 'one', row: pool[1] });
  assertEquals(matchChild(pool, 'Шевчинко Тарас Григорович'), { kind: 'one', row: pool[0] });
});

Deno.test('duplicates are ambiguous and single words need an exact match', () => {
  assertEquals(matchChild(pool, 'Коваль Олена'), { kind: 'ambiguous' });
  assertEquals(matchChild(pool, 'Іван'), { kind: 'one', row: pool[4] });
  assertEquals(matchChild(pool, 'Шевченко'), { kind: 'none' });
  assertEquals(matchChild(pool, 'Зовсім Інша Людина'), { kind: 'none' });
  assertEquals(matchChild(pool, 'x'), { kind: 'none' });
});

Deno.test('live shifts follow child-login rules', () => {
  const shifts = [
    { id: 'past', start_date: '2026-10-01', end_date: '2026-10-10' },
    { id: 'now', start_date: '2026-11-15', end_date: '2026-11-25' },
    { id: 'soon', start_date: '2026-11-20', end_date: '2026-11-30' },
    { id: 'later', start_date: '2026-12-20', end_date: '2026-12-30' },
    { id: 'deleted', start_date: '2026-11-15', end_date: '2026-11-25', deleted_at: '2026-11-16' },
  ];
  assertEquals(liveShiftIds(shifts, '2026-11-18', '2026-11-21'), ['now', 'soon']);
  assertEquals(liveShiftIds(shifts, '2026-12-01', '2026-12-04'), ['later']);
  assertEquals(liveShiftIds(shifts.slice(0, 1), '2026-12-01', '2026-12-04'), ['past']);
  assertEquals(liveShiftIds([], '2026-12-01', '2026-12-04'), []);
});
