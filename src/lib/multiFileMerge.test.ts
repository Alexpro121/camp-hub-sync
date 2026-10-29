import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { mergeSources, type MultiFileSource } from '@/lib/multiFileImporter';

const row = (full_name: string, team_number: number, row_number: number, phone: string | null = null) =>
  ({ full_name, team_number, row_number, phone, is_present: false, team_name: null, note_from_table: null, raw_data: {}, _issues: [], _sourceRow: row_number } as any);
const src = (label: string, rows: any[], teamOffset = 0): MultiFileSource =>
  ({ id: label, label, kind: 'file', status: 'ready', teamOffset, result: { rows, headers: [], headerMap: {}, mapSource: 'local', skipped: 0, detectedTeams: [] } });

describe('злиття кількох файлів у зміну', () => {
  it('дубль у двох файлах склеюється, телефон добирається, джерело не мутує', () => {
    const a = src('a.xlsx', [row('Іваненко Олексій', 1, 1)]);
    const b = src('b.xlsx', [row('Іваненко  Олексій', 1, 1, '+380671234567')]);
    const { rows, summary } = mergeSources([a, b]);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('+380671234567');
    expect(a.result!.rows[0].phone).toBeNull();
    expect(summary.duplicates.some((d) => d.kind === 'exact')).toBe(true);
  });

  it('команда з двох файлів нумерується заново без колізій № за списком', () => {
    const a = src('a.xlsx', [row('Іваненко Олексій', 1, 1), row('Коваль Марія', 1, 2)]);
    const b = src('b.xlsx', [row('Бойко Андрій', 1, 1), row('Мельник Оксана', 1, 2)]);
    const { rows } = mergeSources([a, b]);
    expect(rows.map((r) => r.row_number)).toEqual([1, 2, 3, 4]);
  });

  it('команда з одного файлу зберігає власні номери, а зсув команд працює', () => {
    const a = src('a.xlsx', [row('Іваненко Олексій', 1, 7)]);
    const b = src('b.xlsx', [row('Бойко Андрій', 1, 3)], 4);
    const { rows } = mergeSources([a, b]);
    expect(rows.map((r) => [r.team_number, r.row_number])).toEqual([[1, 7], [5, 3]]);
  });
});
