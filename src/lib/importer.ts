import * as XLSX from 'xlsx';
import { ADMIN_TEAM, TEAM_MAX, TEAM_MIN, isValidTeamNumber, normalizeName } from '@/lib/normalize';

export type StdKey =
  | 'is_present'
  | 'row_number'
  | 'team_number'
  | 'full_name'
  | 'phone'
  | 'team_name'
  | 'note_from_table';

export interface FieldDefinition {
  key: StdKey | 'ignore';
  label: string;
  required?: boolean;
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'full_name', label: "ПІБ дитини", required: true },
  { key: 'team_number', label: '№ Команди' },
  { key: 'phone', label: 'Телефон' },
  { key: 'is_present', label: 'Присутність' },
  { key: 'team_name', label: 'Назва команди / Проєкт' },
  { key: 'note_from_table', label: 'Примітка / Місто' },
  { key: 'row_number', label: '№ за списком' },
  { key: 'ignore', label: '— Пропустити колонку —' },
];

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
  _duplicateWarning?: string;
}

export interface ImportResult {
  rows: ImportRow[];
  headers: string[];
  headerMap: Record<string, StdKey>;
  mapSource: 'ai' | 'local' | 'block' | 'manual';
  skipped: number;
  detectedTeams: number[];
  matrix?: any[][];
}

export function detectTeams(rows: ImportRow[]): number[] {
  return [...new Set(rows.map((r) => r.team_number).filter((n): n is number => !!n))].sort(
    (a, b) => a - b
  );
}

/* ---------- Google Sheets URL Helpers ---------- */

export function parseSheetUrl(url: string): { id: string; gid: string } | null {
  const clean = (url || '').trim();
  const id =
    clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ||
    clean.match(/[?&]id=([a-zA-Z0-9-_]+)/)?.[1] ||
    (/^[a-zA-Z0-9-_]{20,}$/.test(clean) ? clean : null);
  if (!id) return null;
  const gid = clean.match(/[#?&]gid=(\d+)/)?.[1] ?? '0';
  return { id, gid };
}

export function sheetCsvUrl(url: string): string | null {
  const p = parseSheetUrl(url);
  return p ? `https://docs.google.com/spreadsheets/d/${p.id}/export?format=csv&gid=${p.gid}` : null;
}

/* ---------- Synonym Dictionary ---------- */

const SYNONYMS: Record<StdKey, string[]> = {
  is_present: ['навність', 'наявність', 'присутність', 'присутний', 'статус', 'присутствие', 'presence', 'present'],
  row_number: ['№', '#', 'номер', '№ п/п', 'п/п', 'no', 'nn', 'n'],
  team_number: ['№ команди', 'номер команди', 'команда №', '№команди', 'загін', 'отряд', 'team', 'команди', 'група'],
  full_name: [
    'піп дитини', 'піб дитини', 'піп', 'піб', 'фио', 'фіо',
    "імʼя та прізвище", "ім'я та прізвище", "ім'я", 'імя', 'прізвище',
    'name', 'full name', 'дитина', 'учень', 'учасник'
  ],
  phone: ['номер телефону дитини', 'телефон дитини', 'номер телефону', 'телефон', 'мобільний', 'моб', 'phone', 'тел'],
  team_name: ['команда', 'назва команди', 'team name', 'назва загону', 'проєкт', 'проект'],
  note_from_table: ['примітка', 'примітки', 'нотатка', 'примечание', 'місто', 'коментар', 'note', 'notes', 'інфо'],
};

const norm = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/["'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function localHeaderMap(headers: string[]): Record<string, StdKey> {
  const map: Record<string, StdKey> = {};
  const used = new Set<StdKey>();
  const tryAssign = (h: string, key: StdKey) => {
    if (used.has(key) || map[h]) return false;
    map[h] = key;
    used.add(key);
    return true;
  };

  for (const h of headers) {
    const n = norm(h);
    if (!n) continue;
    for (const [key, list] of Object.entries(SYNONYMS) as [StdKey, string[]][]) {
      if (list.includes(n) && tryAssign(h, key)) break;
    }
  }

  for (const h of headers) {
    const n = norm(h);
    if (!n || map[h]) continue;
    for (const [key, list] of Object.entries(SYNONYMS) as [StdKey, string[]][]) {
      if (list.some((s) => s.length > 2 && (n.includes(s) || s.includes(n))) && tryAssign(h, key)) break;
    }
  }
  return map;
}

/* ---------- Text & Name Normalization ---------- */

const ROMAN_NUMERALS: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20
};

export function extractTeamNumberFromText(text: string): number | null {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return null;

  const m1 = s.match(/^(?:команда|загін|загон|team|група)\s*(?:№|#)?\s*(\d+)/i);
  if (m1) return parseInt(m1[1], 10);

  const m2 = s.match(/^(\d+)\s*(?:-?(?:й|я|е|тий|та|ша))?\s*(?:команда|загін|загон|team|група)/i);
  if (m2) return parseInt(m2[1], 10);

  const mRoman = s.match(/^(?:команда|загін|team)\s*([ivx]+)\b/i) || s.match(/^([ivx]+)\s*(?:команда|загін|team)/i);
  if (mRoman && ROMAN_NUMERALS[mRoman[1].toLowerCase()]) {
    return ROMAN_NUMERALS[mRoman[1].toLowerCase()];
  }

  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 1 && n <= 98 ? n : null;
  }

  return null;
}

export function isStatsRow(text: string): boolean {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return false;
  return (
    /\d+\s*дітей/i.test(s) ||
    /\(\s*\d+\s*хл/i.test(s) ||
    /\d+\s*дів/i.test(s) ||
    /^(?:всього|разом|ітого|статистика|кількість|всего):/i.test(s) ||
    /^(?:дівчат|хлопців|мальчиков|девочек)\b/i.test(s)
  );
}

export function isCounselorOrMentorRow(text: string): boolean {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return false;
  if (
    s.includes('каченя') ||
    s.includes('вожат') ||
    s.includes('виховат') ||
    s.includes('ментор') ||
    s.includes('лід') ||
    s.includes('курат') ||
    s.includes('наставник') ||
    s.includes('інструктор')
  ) {
    return true;
  }
  if ((s.includes('+') || s.includes(' / ')) && s.split(/[+/]/).length >= 2) {
    const parts = s.split(/[+/]/).map((p) => p.trim());
    const validParts = parts.filter((p) => p.split(/\s+/).length >= 2);
    if (validParts.length >= 2) return true;
  }
  return false;
}

export function cleanPersonName(raw: string): string {
  let s = String(raw ?? '')
    .replace(/^[\s#№\d.)\-–—]+/, '')
    .replace(/["'’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return s
    .split(' ')
    .map((word) => {
      if (!word) return '';
      return word
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join('-');
    })
    .join(' ');
}

export function isLikelyPersonName(text: string): boolean {
  const s = String(text ?? '').trim();
  if (!s || s.length < 4 || s.length > 70) return false;
  if (isStatsRow(s) || isCounselorOrMentorRow(s)) return false;
  if (extractTeamNumberFromText(s) !== null) return false;

  const low = norm(s);
  for (const list of Object.values(SYNONYMS)) {
    if (list.includes(low)) return false;
  }

  const cleaned = cleanPersonName(s);
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (/[0-9@:/+=_\\*#~<>{}]/.test(s)) return false;

  const namePattern = /^[A-Za-zА-Яа-яЄєІіЇїҐґ'`\-]+$/;
  return words.every((w) => namePattern.test(w) && w.length >= 2);
}

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

/* ---------- Sheet → Matrix Conversion ---------- */

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
  let best = 0,
    bestScore = -1;
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const cells = (matrix[i] || []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const map = localHeaderMap(cells);
    const score = Object.keys(map).length * 2.5 + cells.length * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return bestScore >= 2 ? best : -1;
}

/* ---------- Parse with Custom/Manual Column Mapping ---------- */

export function parseWithCustomMapping(
  matrix: any[][],
  mapping: Record<number, StdKey | 'ignore'>,
  startRow: number = 0,
  defaultTeam: number = 1
): ImportResult {
  const rows: ImportRow[] = [];
  const seen = new Map<string, ImportRow>();
  let skipped = 0;
  let currentTeam = defaultTeam;

  for (let i = startRow; i < matrix.length; i++) {
    const r = matrix[i] || [];
    if (r.every((c) => c === '' || c == null)) continue;

    let fullName = '';
    let phone: string | null = null;
    let presence = false;
    let teamNumber: number | null = null;
    let teamName: string | null = null;
    let note: string | null = null;
    let rowNumber: number | null = null;
    const rawData: Record<string, any> = {};

    Object.entries(mapping).forEach(([colStr, key]) => {
      const colIdx = parseInt(colStr, 10);
      const val = r[colIdx];
      if (val === undefined || val === null || val === '') return;
      rawData[`Col_${colIdx + 1}`] = val;

      if (key === 'full_name') fullName = cleanPersonName(String(val));
      else if (key === 'team_number') teamNumber = parseIntSafe(val) ?? extractTeamNumberFromText(String(val));
      else if (key === 'phone') phone = normalizePhone(val);
      else if (key === 'is_present') presence = normalizePresence(val);
      else if (key === 'team_name') teamName = String(val).trim();
      else if (key === 'note_from_table') note = String(val).trim();
      else if (key === 'row_number') rowNumber = parseIntSafe(val);
    });

    if (!fullName) {
      // Check if this row is a team header like "1 команда"
      const detected = extractTeamNumberFromText(String(r[0] ?? ''));
      if (detected !== null) currentTeam = detected;
      continue;
    }

    if (isStatsRow(fullName) || isCounselorOrMentorRow(fullName)) {
      skipped++;
      continue;
    }

    const finalTeam = teamNumber && isValidTeamNumber(teamNumber) ? teamNumber : currentTeam;
    const issues: string[] = [];
    if (!fullName) issues.push("Не вказано ім'я");
    if (!isValidTeamNumber(finalTeam)) issues.push(`Некоректна команда №${finalTeam}`);

    const key = `${finalTeam}|${normalizeName(fullName)}`;
    const prev = seen.get(key);
    if (prev) {
      skipped++;
      if ((prev.phone ?? '') !== (phone ?? '')) {
        prev._duplicateWarning = `Дубль/однофамілець у рядку ${i + 1}: телефон «${phone ?? '—'}» ≠ «${prev.phone ?? '—'}»`;
        if (!prev._issues.includes('Потребує перевірки')) prev._issues.push('Потребує перевірки');
      }
      continue;
    }

    const row: ImportRow = {
      is_present: presence,
      row_number: rowNumber ?? rows.length + 1,
      team_number: finalTeam,
      full_name: fullName,
      phone,
      team_name: teamName,
      note_from_table: note,
      raw_data: rawData,
      _issues: issues,
      _sourceRow: i + 1,
    };

    seen.set(key, row);
    rows.push(row);
  }

  const detectedTeams = detectTeams(rows);
  const headerMap: Record<string, StdKey> = {};
  Object.entries(mapping).forEach(([colIdx, key]) => {
    if (key !== 'ignore') {
      const headerName = String(matrix[Math.max(0, startRow - 1)]?.[parseInt(colIdx, 10)] || `Колонка ${parseInt(colIdx, 10) + 1}`);
      headerMap[headerName] = key;
    }
  });

  return {
    rows,
    headers: Object.keys(headerMap),
    headerMap,
    mapSource: 'manual',
    skipped,
    detectedTeams,
    matrix,
  };
}

/* ---------- Block Parser ---------- */

function parseBlockFormat(matrix: any[][]): ImportResult | null {
  let hasTeamHeaders = false;
  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const firstCell = String(r[0] ?? '').trim();
    if (extractTeamNumberFromText(firstCell) !== null) {
      hasTeamHeaders = true;
      break;
    }
  }

  if (!hasTeamHeaders) return null;

  const rows: ImportRow[] = [];
  const seen = new Map<string, ImportRow>();
  let skipped = 0;

  let currentTeamNumber: number | null = null;
  let currentTeamName: string | null = null;
  let rowNumberInTeam = 0;

  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const cells = r.map((c: any) => String(c ?? '').trim());
    if (cells.every((c: string) => !c)) continue;

    const cell0 = cells[0] || '';
    const teamNum = extractTeamNumberFromText(cell0);

    if (teamNum !== null) {
      currentTeamNumber = teamNum;
      currentTeamName = null;
      rowNumberInTeam = 0;
      continue;
    }

    if (currentTeamNumber === null) continue;
    if (cells.some(isStatsRow)) continue;
    if (cells.some(isCounselorOrMentorRow)) continue;

    if (!currentTeamName && cell0 && !isLikelyPersonName(cell0)) {
      if (cell0.length < 60 && !/^\d+$/.test(cell0)) {
        currentTeamName = cell0;
        continue;
      }
    }

    let nameIdx = -1;
    for (let c = 0; c < Math.min(3, cells.length); c++) {
      if (isLikelyPersonName(cells[c])) {
        nameIdx = c;
        break;
      }
    }

    if (nameIdx !== -1) {
      const rawName = cells[nameIdx];
      const fullName = cleanPersonName(rawName);
      rowNumberInTeam++;

      let phone: string | null = null;
      let presence = false;
      let note: string | null = null;

      for (let c = 0; c < cells.length; c++) {
        if (c === nameIdx) continue;
        const val = cells[c];
        if (!val) continue;

        if (!phone && normalizePhone(val) && val.replace(/\D/g, '').length >= 9) {
          phone = normalizePhone(val);
        } else if (TRUES.includes(norm(val)) || FALSES.includes(norm(val))) {
          presence = normalizePresence(val);
        } else if (!note && val.length > 2 && val !== String(rowNumberInTeam)) {
          note = val;
        }
      }

      if (!isValidTeamNumber(currentTeamNumber)) {
        skipped++;
        continue;
      }

      const key = `${currentTeamNumber}|${normalizeName(fullName)}`;
      const prev = seen.get(key);
      if (prev) {
        skipped++;
        if ((prev.phone ?? '') !== (phone ?? '')) {
          prev._duplicateWarning = `Дубль/однофамілець у рядку ${i + 1}: телефон «${phone ?? '—'}» ≠ «${prev.phone ?? '—'}»`;
          if (!prev._issues.includes('Потребує перевірки')) prev._issues.push('Потребує перевірки');
        }
        continue;
      }

      const raw_data: Record<string, any> = {};
      cells.forEach((val: string, idx: number) => {
        if (val) raw_data[`Col_${idx + 1}`] = val;
      });

      const row: ImportRow = {
        is_present: presence,
        row_number: rowNumberInTeam,
        team_number: currentTeamNumber,
        full_name: fullName,
        phone,
        team_name: currentTeamName,
        note_from_table: note,
        raw_data,
        _issues: [],
        _sourceRow: i + 1,
      };

      seen.set(key, row);
      rows.push(row);
    }
  }

  if (rows.length === 0) return null;

  return {
    rows,
    headers: ['ПІБ', 'Команда', 'Телефон', 'Присутність'],
    headerMap: {
      'ПІБ': 'full_name',
      'Команда': 'team_number',
      'Телефон': 'phone',
      'Присутність': 'is_present',
    },
    mapSource: 'block',
    skipped,
    detectedTeams: detectTeams(rows),
    matrix,
  };
}

/* ---------- Classic Table Parser ---------- */

function parseClassicTable(
  matrix: any[][],
  headerIdx: number,
  headerMap: Record<string, StdKey>
): { rows: ImportRow[]; skipped: number } {
  const headers = (matrix[headerIdx] || []).map((h: any) => String(h ?? '').trim());
  const colOf: Partial<Record<StdKey, number>> = {};
  headers.forEach((h, i) => {
    const key = headerMap[h];
    if (key && colOf[key] === undefined) colOf[key] = i;
  });

  const rows: ImportRow[] = [];
  const seen = new Map<string, ImportRow>();
  let skipped = 0;
  let currentTeam = 1;

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    if (r.every((c) => c === '' || c == null)) continue;

    const raw_data: Record<string, any> = {};
    headers.forEach((h, idx) => {
      const v = r[idx];
      if (!h || v === '' || v == null) return;
      raw_data[h] = v;
    });

    let fullName = String(colOf.full_name !== undefined ? r[colOf.full_name] ?? '' : '').trim();
    if (!fullName) {
      for (let c = 0; c < Math.min(3, r.length); c++) {
        if (isLikelyPersonName(String(r[c] ?? ''))) {
          fullName = String(r[c]);
          break;
        }
      }
    }

    if (fullName) fullName = cleanPersonName(fullName);

    let teamNum = colOf.team_number !== undefined ? (parseIntSafe(r[colOf.team_number]) ?? 0) : 0;
    if (!teamNum) {
      for (const cell of r) {
        const extracted = extractTeamNumberFromText(String(cell ?? ''));
        if (extracted !== null) {
          currentTeam = extracted;
          teamNum = extracted;
          break;
        }
      }
    }

    if (!teamNum) teamNum = currentTeam;

    const issues: string[] = [];
    if (!fullName) issues.push("Не вказано ім'я");
    if (!teamNum) issues.push('Не вказано № команди');

    if (!fullName && !teamNum) {
      skipped++;
      continue;
    }

    if (isStatsRow(fullName) || isCounselorOrMentorRow(fullName)) {
      skipped++;
      continue;
    }

    if (!isValidTeamNumber(teamNum)) {
      issues.push(`Команда №${teamNum} недопустима (дозволено ${TEAM_MIN}..${TEAM_MAX}, ${ADMIN_TEAM} — адмін)`);
      skipped++;
      continue;
    }

    const phone = colOf.phone !== undefined ? normalizePhone(r[colOf.phone]) : null;
    const key = `${teamNum}|${normalizeName(fullName)}`;
    const prev = fullName ? seen.get(key) : undefined;
    if (prev) {
      skipped++;
      if ((prev.phone ?? '') !== (phone ?? '')) {
        prev._duplicateWarning = `Дубль/однофамілець у рядку ${i + 1}: телефон «${phone ?? '—'}» ≠ «${prev.phone ?? '—'}»`;
        if (!prev._issues.includes('Потребує перевірки')) prev._issues.push('Потребує перевірки');
      }
      continue;
    }

    const row: ImportRow = {
      is_present: colOf.is_present !== undefined ? normalizePresence(r[colOf.is_present]) : false,
      row_number: colOf.row_number !== undefined ? parseIntSafe(r[colOf.row_number]) : null,
      team_number: teamNum,
      full_name: fullName,
      phone,
      team_name: colOf.team_name !== undefined ? String(r[colOf.team_name] ?? '').trim() || null : null,
      note_from_table: colOf.note_from_table !== undefined ? String(r[colOf.note_from_table] ?? '').trim() || null : null,
      raw_data,
      _issues: issues,
      _sourceRow: i + 1,
    };

    if (fullName) seen.set(key, row);
    rows.push(row);
  }

  return { rows, skipped };
}

/* ---------- Main Universal Parser Entry Point ---------- */

export function buildRows(
  matrix: any[][],
  headerIdx: number,
  headerMap: Record<string, StdKey>
): { rows: ImportRow[]; skipped: number } {
  if (!matrix || matrix.length === 0) return { rows: [], skipped: 0 };

  const blockResult = parseBlockFormat(matrix);
  if (blockResult && blockResult.rows.length >= 3) {
    return blockResult;
  }

  const effectiveHeaderIdx = headerIdx >= 0 ? headerIdx : detectHeaderIndex(matrix);
  const effectiveMap = Object.keys(headerMap).length > 0
    ? headerMap
    : localHeaderMap((matrix[effectiveHeaderIdx >= 0 ? effectiveHeaderIdx : 0] || []).map(String));

  return parseClassicTable(matrix, effectiveHeaderIdx >= 0 ? effectiveHeaderIdx : 0, effectiveMap);
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
