import * as XLSX from 'xlsx';
import type { Child } from '@/types/app';
import { buildRows, extractLineDetails, normalizePhone, type ImportRow } from '@/lib/importer';

export interface ParsedRow {
  is_present: boolean;
  row_number: number | null;
  team_number: number;
  full_name: string;
  phone: string | null;
  team_name: string | null;
  note_from_table: string | null;
  raw_data: Record<string, any>;
}

/**
 * Універсальний парсер Excel/CSV-файлу.
 * Автоматично розпізнає класичні таблиці, списки за командами (блоковий формат)
 * та нестандартне розташування колонок.
 */
export async function parseExcelFile(file: File | ArrayBuffer): Promise<ParsedRow[]> {
  let arrayBuffer: ArrayBuffer;

  if (file instanceof File) {
    arrayBuffer = await file.arrayBuffer();
  } else {
    arrayBuffer = file;
  }

  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  if (!wb.SheetNames.length) return [];

  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (matrix.length === 0) return [];

  // Використовуємо універсальний інтелектуальний парсер
  const parsedResult = buildRows(matrix);

  if (!parsedResult.rows || parsedResult.rows.length === 0) {
    return [];
  }

  // Конвертуємо результат у формат ParsedRow
  return parsedResult.rows.map((r: ImportRow): ParsedRow => {
    const { cleanName, note } = extractLineDetails(r.full_name);

    return {
      is_present: r.is_present ?? false,
      row_number: r.row_number ?? null,
      team_number: r.team_number,
      full_name: cleanName || r.full_name,
      phone: r.phone ? normalizePhone(r.phone) : null,
      team_name: r.team_name ?? null,
      note_from_table: r.note_from_table || note || null,
      raw_data: r.raw_data ?? {},
    };
  });
}

/**
 * Експорт бази дітей у гарно сформатований Excel-файл з автошириною колонок
 */
export function exportToExcel(children: Child[]) {
  // Сортуємо список перед експортом: спочатку за номером команди, потім за порядковим номером
  const sorted = [...children].sort((a, b) => {
    if (a.team_number !== b.team_number) {
      return a.team_number - b.team_number;
    }
    return (a.row_number ?? 0) - (b.row_number ?? 0);
  });

  const data = sorted.map((c) => ({
    'Наявність': c.is_present ? '✓' : '',
    '№': c.row_number ?? '',
    '№ Команди': c.team_number,
    'ПІБ дитини': c.full_name,
    'Номер телефону дитини': c.phone ?? '',
    'Команда': c.team_name ?? '',
    'Примітка': c.note_from_table ?? '',
    'Айрон Долари': c.iron_dollars ?? 0,
    'Telegram': c.telegram_username ?? '',
    'Замітки супроводу': c.supervisor_notes ?? '',
    'Увійшов в систему': c.has_logged_in ? '✓' : '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // Налаштування оптимальної ширини колонок для друку та перегляду
  ws['!cols'] = [
    { wch: 11 }, // Наявність
    { wch: 6 },  // №
    { wch: 12 }, // № Команди
    { wch: 34 }, // ПІБ дитини
    { wch: 22 }, // Номер телефону дитини
    { wch: 18 }, // Команда
    { wch: 24 }, // Примітка
    { wch: 14 }, // Айрон Долари
    { wch: 18 }, // Telegram
    { wch: 35 }, // Замітки супроводу
    { wch: 18 }, // Увійшов в систему
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'База');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Залізна_Зміна_База_${date}.xlsx`);
}
