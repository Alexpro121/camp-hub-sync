import * as XLSX from 'xlsx';
import type { Child } from '@/types/app';
import { normalizeName } from '@/lib/normalize';

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

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  'наявність': 'is_present',
  'присутність': 'is_present',
  '№': 'row_number',
  'номер': 'row_number',
  '№ команди': 'team_number',
  'команди': 'team_number',
  'номер команди': 'team_number',
  'піб': 'full_name',
  'піб дитини': 'full_name',
  'фио': 'full_name',
  'номер телефону': 'phone',
  'номер телефону дитини': 'phone',
  'телефон': 'phone',
  'команда': 'team_name',
  'примітка': 'note_from_table',
  'примечание': 'note_from_table',
};

function normalizePhone(v: any): string | null {
  const s = String(v ?? '').replace(/[^\d+]/g, '').trim();
  return s || null;
}

export async function parseExcelFile(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  // Detect header row (first row with at least 3 string headers)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const stringCount = rows[i].filter((c) => typeof c === 'string' && c.trim()).length;
    if (stringCount >= 3) { headerIdx = i; break; }
  }
  const rawHeaders = rows[headerIdx].map((h: any) => String(h ?? '').trim());
  const headers = rawHeaders.map((h) => h.toLowerCase());

  const colIdx: Partial<Record<keyof ParsedRow, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key && colIdx[key] === undefined) colIdx[key] = i;
  });

  const result: ParsedRow[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c === '' || c == null)) continue;
    const fullName = String(r[colIdx.full_name ?? 3] ?? '').trim();
    if (!fullName) continue;
    const teamRaw = r[colIdx.team_number ?? 2];
    const teamNum = parseInt(String(teamRaw).replace(/[^\d]/g, ''), 10);
    if (!teamNum) continue;

    const phone = normalizePhone(r[colIdx.phone ?? 4]);
    const dupKey = `${normalizeName(fullName)}|${phone ?? ''}|${teamNum}`;
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);

    // Build raw_data with ALL non-empty columns, preserving original headers
    const raw_data: Record<string, any> = {};
    rawHeaders.forEach((h, idx) => {
      if (!h) return;
      const v = r[idx];
      if (v === '' || v == null) return;
      raw_data[h] = v;
    });

    result.push({
      // Default everyone to NOT present on import — supervisors mark presence manually each shift
      is_present: false,
      row_number: parseInt(String(r[colIdx.row_number ?? 1]).replace(/[^\d]/g, ''), 10) || null,
      team_number: teamNum,
      full_name: fullName,
      phone,
      team_name: String(r[colIdx.team_name ?? 5] ?? '').trim() || null,
      note_from_table: String(r[colIdx.note_from_table ?? 6] ?? '').trim() || null,
      raw_data,
    });
  }
  return result;
}

export function exportToExcel(children: Child[]) {
  const data = children.map((c) => ({
    'Наявність': c.is_present ? '✓' : '',
    '№': c.row_number ?? '',
    '№ Команди': c.team_number,
    'ПІБ дитини': c.full_name,
    'Номер телефону дитини': c.phone ?? '',
    'Команда': c.team_name ?? '',
    'Примітка': c.note_from_table ?? '',
    'Айрон Долари': c.iron_dollars,
    'Telegram': c.telegram_username ?? '',
    'Замітки супроводу': c.supervisor_notes ?? '',
    'Увійшов в систему': c.has_logged_in ? '✓' : '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'База');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Help_Суправід_${date}.xlsx`);
}
