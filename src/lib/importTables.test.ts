import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: async () => ({ data: null, error: { message: 'off' } }) } } }));
import { analyzeMatrix } from '@/lib/importAnalyze';
import { isCounselorOrMentorRow } from '@/lib/importer';

const brief = (r: { rows: { team_number: number; full_name: string; phone: string | null }[] }) =>
  r.rows.map((x) => `${x.team_number}|${x.full_name}|${x.phone ?? ''}`);

describe('імпорт таблиць: реальні випадки', () => {
  it('окремі колонки Прізвище / Ім’я / По батькові збираються в ПІБ', async () => {
    const r = await analyzeMatrix([
      ['№', 'Прізвище', "Ім'я", 'По батькові', 'Команда', 'Телефон'],
      [1, 'Іваненко', 'Олексій', 'Петрович', 3, '0671234567'],
      [2, 'Коваль', 'Марія', 'Іванівна', 3, '0501234567'],
    ]);
    expect(brief(r)).toEqual(['3|Іваненко Олексій Петрович|+380671234567', '3|Коваль Марія Іванівна|+380501234567']);
  });

  it('порожня клітинка команди (об’єднані клітинки) успадковує команду з попередніх рядків', async () => {
    const r = await analyzeMatrix([
      ['№', 'ПІБ', 'Команда №'],
      [1, 'Іваненко Олексій', 1], [2, 'Коваль Марія', ''], [3, 'Бойко Андрій', ''],
      [4, 'Шевченко Іван', 2], [5, 'Мельник Оксана', ''],
    ]);
    expect(r.rows.map((x) => x.team_number)).toEqual([1, 1, 1, 2, 2]);
  });

  it('колонка «Команда» з самими номерами — це номер команди', async () => {
    const r = await analyzeMatrix([['ПІБ', 'Команда'], ['Іваненко Олексій', 3], ['Коваль Марія', 3], ['Бойко Андрій', 4]]);
    expect(r.rows.map((x) => x.team_number)).toEqual([3, 3, 4]);
  });

  it('телефон береться з колонки мами, якщо в дитини порожньо; числовий телефон нормалізується', async () => {
    const r = await analyzeMatrix([
      ['ПІБ дитини', 'Команда №', 'Телефон дитини', 'Телефон мами'],
      ['Іваненко Олексій', 1, '', '0671234567'],
      ['Коваль Марія', 1, 501234567, '0991112233'],
    ]);
    expect(r.rows.map((x) => x.phone)).toEqual(['+380671234567', '+380501234567']);
  });

  it('рядки супроводу та підсумків не стають дітьми', async () => {
    const r = await analyzeMatrix([
      ['ПІБ', 'Команда №'], ['Вожатий: Петров Петро', 1], ['Іваненко Олексій', 1], ['Всього: 1', ''],
      ['Супровід Ковальчук Н.', 2], ['Бойко Андрій', 2],
    ]);
    expect(r.rows.map((x) => x.full_name)).toEqual(['Іваненко Олексій', 'Бойко Андрій']);
  });

  it('діти з іменами Лідія / Лідовий не відсікаються як «лідери»', () => {
    expect(isCounselorOrMentorRow('Лідія Коваль')).toBe(false);
    expect(isCounselorOrMentorRow('Лідовий Максим')).toBe(false);
    expect(isCounselorOrMentorRow('Лід команди: Петров')).toBe(true);
    expect(isCounselorOrMentorRow('Куратор Сидоренко')).toBe(true);
  });

  it('однофамільці в різних командах лишаються, дубль у межах команди склеюється', async () => {
    const r = await analyzeMatrix([
      ['ПІБ', 'Команда №'], ["Лук'янов Дмитро", 1], ['Лук’янов  Дмитро', 1], ['Петренко Ольга', 1], ['Петренко Ольга', 2],
    ]);
    expect(brief(r).map((s) => s.split('|').slice(0, 2).join('|'))).toEqual(["1|Лук'янов Дмитро", '1|Петренко Ольга', '2|Петренко Ольга']);
  });

  it('блоковий список із заголовками команд', async () => {
    const r = await analyzeMatrix([['Команда 1'], ['1. Іваненко Олексій'], ['Команда 2'], ['1. Шевченко Іван']]);
    expect(brief(r)).toEqual(['1|Іваненко Олексій|', '2|Шевченко Іван|']);
  });
});

import { analyzeSheets } from '@/lib/importAnalyze';
import { sheetsFromWorkbook } from '@/lib/importer';
import * as XLSX from 'xlsx';

describe('Excel із кількома аркушами', () => {
  const book = (sheets: Record<string, any[][]>) => {
    const wb = XLSX.utils.book_new();
    for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    return sheetsFromWorkbook(XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' }));
  };

  it('аркуш на команду: номер команди береться з назви аркуша, порожні аркуші пропускаються', async () => {
    const r = await analyzeSheets(book({
      'Команда 1': [['ПІБ', 'Телефон'], ['Іваненко Олексій', '0671234567'], ['Коваль Марія', '']],
      'Команда 2': [['ПІБ', 'Телефон'], ['Бойко Андрій', '']],
      'Порожній': [[]],
    }));
    expect(brief(r)).toEqual(['1|Іваненко Олексій|+380671234567', '1|Коваль Марія|', '2|Бойко Андрій|']);
    expect(r.detectedTeams).toEqual([1, 2]);
  });

  it('якщо команда є в колонці — назва аркуша її не перезаписує', async () => {
    const r = await analyzeSheets(book({
      'Список А': [['ПІБ', 'Команда №'], ['Іваненко Олексій', 4]],
      'Список Б': [['ПІБ', 'Команда №'], ['Бойко Андрій', 5]],
    }));
    expect(r.rows.map((x) => x.team_number)).toEqual([4, 5]);
  });
});
