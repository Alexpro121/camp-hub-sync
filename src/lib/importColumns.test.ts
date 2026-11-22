/** Таблиця реєстрації «Наявність | № | № команди | ПІБ | Телефон | Категорія | Примітки» і її варіанти. */
import { describe, expect, it } from 'vitest';
import { buildRows, normalizePhone, toDbRow } from '@/lib/importer';

const HEAD = ['Наявність', '№', '№ команди', 'ПІБ дитини', 'Номер мобільного телефону', 'Категорія', 'Примітки'];
const DATA = [
  ['TRUE', '1', '5', 'Петренко Максим Олександрович ', '+380962758290', 'ЛІДЕРИ', 'Строїть під Львовом'],
  ['FALSE', '2', '4', 'Олійник Поліна Сергіївна', '0678021303', 'ЛІДЕРИ', ''],
  ['TRUE', '3', '2', 'Прокопів Андрій Іванович', '+380996641270', 'ЛІДЕРИ', ''],
  ['TRUE', '4', '3', 'Білан.   Дмитро Іванович', '688651235', 'УЗ', ''],
  ['TRUE', '5', '2', 'Ілечко Анна Андріївна', '099554060', 'ЛІДЕРИ', ''],
  ['TRUE', '6', '2', 'Прокопів Андрій Іванович', '996641270', 'САЙТ', ''],
  ['TRUE', '7', '2', 'Олійник Поліна Сергіївна', '+380678021303', 'САЙТ', ''],
  ['', '', '2', 'Феєр Максим', '', '', ''],
];
const byName = (rows: ReturnType<typeof buildRows>['rows'], n: string) => rows.filter((r) => r.full_name === n);

describe('розпізнавання стовпчиків таблиці реєстрації', () => {
  const { rows, headerMap } = buildRows([HEAD, ...DATA]);

  it('«Категорія» — категорія дитини, «Наявність» — прибуття (checked_in), не перекличка', () => {
    expect(headerMap['Категорія']).toBe('team_name');
    expect(headerMap['Наявність']).toBe('is_present');
    const db = toDbRow(byName(rows, 'Петренко Максим Олександрович')[0], 's');
    expect(db).toMatchObject({ checked_in: true, team_name: 'ЛІДЕРИ', team_number: 5, row_number: 1 });
    expect(db).not.toHaveProperty('is_present');
  });

  it('рядок без № отримує наступний після найбільшого, а не чужий', () => {
    expect(byName(rows, 'Феєр Максим')[0].row_number).toBe(8);
    expect(new Set(rows.map((r) => r.row_number)).size).toBe(rows.length);
  });

  it('прибирає крапку після прізвища і зливає дубль у тій самій команді', () => {
    expect(byName(rows, 'Білан Дмитро Іванович')).toHaveLength(1);
    expect(byName(rows, 'Прокопів Андрій Іванович')).toHaveLength(1);
  });

  it('та сама дитина в різних командах — на перевірку', () => {
    const twins = byName(rows, 'Олійник Поліна Сергіївна');
    expect(twins.map((r) => r.team_number).sort()).toEqual([2, 4]);
    twins.forEach((r) => expect(r._duplicateWarning).toMatch(/Та сама дитина є в команді/));
  });

  it('номер, у якому бракує цифри, не перетворюється на +380099… і йде на перевірку', () => {
    const r = byName(rows, 'Ілечко Анна Андріївна')[0];
    expect(r.phone).toBe('+38099554060');
    expect(r._issues).toContain('Потребує перевірки');
    expect(normalizePhone('979114736')).toBe('+380979114736');
    expect(normalizePhone('380(63)795-70-86')).toBe('+380637957086');
  });

  it('перший стовпчик «№» — номер за списком, а не команда', () => {
    const res = buildRows([HEAD.slice(1), ...DATA.map((r) => r.slice(1))]);
    expect(res.mapSource).not.toBe('block');
    expect(res.detectedTeams).toEqual([2, 3, 4, 5]);
    expect(byName(res.rows, 'Петренко Максим Олександрович')[0].team_number).toBe(5);
  });
});
