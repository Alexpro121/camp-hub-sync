import * as XLSX from 'xlsx';
import { normalizeName } from '@/lib/normalize';

export type StdKey =
  | 'is_present' | 'row_number' | 'team_number' | 'full_name'
  | 'phone' | 'team_name' | 'note_from_table';

export interface ImportRow {
  is_present: boolean;
  row_number: number | null;
  team_number: number;
  full_name: string;
  phone: string | null;
  team_name: string | null;
  note_from_table: string | null;
  raw_data: Record<string, any>;
  _issues: string[];
  _sourceRow: number;
  /** Same team + same name, but a conflicting/missing phone — needs a human check. */
  _duplicateWarning?: string;

}

export interface ImportResult {
  rows: ImportRow[];
  headers: string[];
  headerMap: Record<string, StdKey>;
  mapSource: 'ai' | 'local';
  skipped: number;
  /** Unique team numbers discovered in the source file — no static assumptions. */
  detectedTeams: number[];
}

/** Extracts every distinct team number present in the parsed rows. */
export function detectTeams(rows: ImportRow[]): number[] {
  return [...new Set(rows.map((r) => r.team_number).filter((n): n is number => !!n))]
    .sort((a, b) => a - b);
}

/* ---------- Google Sheets URL ---------- */

export function parseSheetUrl(url: string): { id: string; gid: string } | null {
  const clean = (url || '').trim();
  const id = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    || clean.match(/[?&]id=([a-zA-Z0-9-_]+)/)?.[1]
    || (/^[a-zA-Z0-9-_]{20,}$/.test(clean) ? clean : null);
  if (!id) return null;
  const gid = clean.match(/[#?&]gid=(\d+)/)?.[1] ?? '0';
  return { id, gid };
}

export function sheetCsvUrl(url: string): string | null {
  const p = parseSheetUrl(url);
  return p ? `https://docs.google.com/spreadsheets/d/${p.id}/export?format=csv&gid=${p.gid}` : null;
}

/* ---------- Local synonym dictionary ---------- */

const SYNONYMS: Record<StdKey, string[]> = {
  is_present: ['навність', 'наявність', 'присутність', 'присутний', 'статус', 'присутствие', 'presence', 'present'],
  row_number: ['№', '#', 'номер', '№ п/п', 'п/п', 'no', 'nn'],
  team_number: ['№ команди', 'номер команди', 'команда №', '№команди', 'загін', 'отряд', 'team', 'команди'],
  full_name: ['піп дитини', 'піб дитини', 'піп', 'піб', 'фио', 'фіо', "імʼя та прізвище", "ім'я та прізвище", "ім'я", 'імя', 'прізвище', 'name', 'full name'],
  phone: ['номер телефону дитини', 'телефон дитини', 'номер телефону', 'телефон', 'мобільний', 'моб', 'phone'],
  team_name: ['команда', 'назва команди', 'team name'],
  note_from_table: ['примітка', 'примітки', 'нотатка', 'примечание', 'місто', 'коментар', 'note', 'notes'],
};

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function localHeaderMap(headers: string[]): Record<string, StdKey> {
  const map: Record<string, StdKey> = {};
  const used = new Set<StdKey>();
  const tryAssign = (h: string, key: StdKey) => {
    if (used.has(key) || map[h]) return false;
    map[h] = key; used.add(key); return true;
  };
  // pass 1 — exact
  for (const h of headers) {
    const n = norm(h);
    if (!n) continue;
    for (const [key, list] of Object.entries(SYNONYMS) as [StdKey, string[]][]) {
      if (list.includes(n) && tryAssign(h, key)) break;
    }
  }
  // pass 2 — partial
  for (const h of headers) {
    const n = norm(h);
    if (!n || map[h]) continue;
    for (const [key, list] of Object.entries(SYNONYMS) as [StdKey, string[]][]) {
      if (list.some((s) => s.length > 3 && (n.includes(s) || s.includes(n))) && tryAssign(h, key)) break;
    }
  }
  return map;
}

/* ---------- Normalization ---------- */

export function normalizePhone(v: any): string | null {
  let s = String(v ?? '').trim();
  if (!s) return null;
  const plus = s.startsWith('+');
  let d = s.replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9) return `+380${d}`;
  if (d.length === 10 && d.startsWith('0')) return `+380${d.slice(1)}`;
  if (d.length === 12 && d.startsWith('380')) return `+${d}`;
  if (d.length === 11 && d.startsWith('80')) return `+3${d}`;
  return plus ? `+${d}` : `+${d}`;
}

const TRUES = ['true', '1', 'да', 'так', '+', 'присутній', 'присутний', 'присутня', 'yes', 'y', 'є', 'v', '✓', 'x'];
const FALSES = ['false', '0', 'ні', 'нi', 'нет', '-', 'відсутній', 'відсутня', 'no', 'n', ''];

export function normalizePresence(v: any): boolean {
  if (typeof v === 'boolean') return v;
  const s = norm(String(v ?? ''));
  if (TRUES.includes(s)) return true;
  if (FALSES.includes(s)) return false;
  return false;
}

export function parseIntSafe(v: any): number | null {
  const s = String(v ?? '').replace(/[^\d]/g, '');
  return s ? parseInt(s, 10) : null;
}

/* ---------- Sheet → matrix ---------- */

export function matrixFromCsv(csv: string): any[][] {
  const wb = XLSX.read(csv, { type: 'string', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
}

export async function matrixFromFile(file: File): Promise<any[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
}

export function detectHeaderIndex(matrix: any[][]): number {
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(8, matrix.length); i++) {
    const cells = (matrix[i] || []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const map = localHeaderMap(cells);
    const score = Object.keys(map).length * 2 + cells.length * 0.1;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/* ---------- Build rows ---------- */

export function buildRows(matrix: any[][], headerIdx: number, headerMap: Record<string, StdKey>): { rows: ImportRow[]; skipped: number } {
  const headers = (matrix[headerIdx] || []).map((h: any) => String(h ?? '').trim());
  const colOf: Partial<Record<StdKey, number>> = {};
  headers.forEach((h, i) => {
    const key = headerMap[h];
    if (key && colOf[key] === undefined) colOf[key] = i;
  });

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    if (r.every((c) => c === '' || c == null)) continue;

    const raw_data: Record<string, any> = {};
    headers.forEach((h, idx) => {
      const v = r[idx];
      if (!h || v === '' || v == null) return;
      raw_data[h] = v;
    });

    const full_name = String(colOf.full_name !== undefined ? r[colOf.full_name] ?? '' : '').replace(/\s+/g, ' ').trim();
    const team_number = colOf.team_number !== undefined ? (parseIntSafe(r[colOf.team_number]) ?? 0) : 0;
    const issues: string[] = [];
    if (!full_name) issues.push("Не вказано ім'я");
    if (!team_number) issues.push('Не вказано № команди');

    if (!full_name && !team_number) { skipped++; continue; }

    const phone = colOf.phone !== undefined ? normalizePhone(r[colOf.phone]) : null;
    const key = `${team_number}|${normalizeName(full_name)}|${phone ?? ''}`;
    if (full_name && seen.has(key)) { skipped++; continue; }
    seen.add(key);

    rows.push({
      is_present: colOf.is_present !== undefined ? normalizePresence(r[colOf.is_present]) : false,
      row_number: colOf.row_number !== undefined ? parseIntSafe(r[colOf.row_number]) : null,
      team_number,
      full_name,
      phone,
      team_name: colOf.team_name !== undefined ? String(r[colOf.team_name] ?? '').trim() || null : null,
      note_from_table: colOf.note_from_table !== undefined ? String(r[colOf.note_from_table] ?? '').trim() || null : null,
      raw_data,
      _issues: issues,
      _sourceRow: i + 1,
    });
  }
  return { rows, skipped };
}

export function toDbRow(r: ImportRow, shiftId: string) {
  return {
    shift_id: shiftId,
    is_present: r.is_present,
    row_number: r.row_number,
    team_number: r.team_number,
    full_name: r.full_name,
    phone: r.phone,
    team_name: r.team_name,
    note_from_table: r.note_from_table,
    raw_data: r.raw_data,
  };
}
