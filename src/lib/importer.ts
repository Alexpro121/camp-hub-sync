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
  { key: 'full_name', label: 'ПІБ дитини', required: true },
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
  mapSource: 'ai' | 'local' | 'block' | 'manual' | 'pdf';
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

/* ---------- Словник синонімів ---------- */

const SYNONYMS: Record<StdKey, string[]> = {
  is_present: ['навність', 'наявність', 'присутність', 'присутний', 'статус', 'присутствие', 'presence', 'present'],
  row_number: ['№', '#', 'номер', '№ п/п', 'п/п', 'no', 'nn', 'n'],
  team_number: ['№ команди', 'номер команди', 'команда №', '№команди', 'загін', 'отряд', 'team', 'команди', 'група'],
  full_name: [
    'піп дитини', 'піб дитини', 'піп', 'піб', 'фио', 'фіо',
    "імʼя та прізвище", "ім'я та прізвище", "ім'я", 'імя', 'прізвище',
    'name', 'full name', 'дитина', 'учень', 'учасник', 'прізвище імʼя'
  ],
  phone: ['номер телефону дитини', 'телефон дитини', 'номер телефону', 'телефон', 'мобільний', 'моб', 'phone', 'тел'],
  team_name: ['команда', 'назва команди', 'team name', 'назва загону', 'проєкт', 'проект', 'напрям'],
  note_from_table: ['примітка', 'примітки', 'нотатка', 'примечание', 'місто', 'коментар', 'note', 'notes', 'інфо', 'готель', 'пільга'],
};

const norm = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/["'’`ʼʻ]/g, "'")
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

/* ---------- Нормалізація та розпізнавання рядків ---------- */

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
    /^(?:всього|разом|ітого|статистика|кількість|всего):?/i.test(s) ||
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

export function extractLineDetails(raw: string): {
  rowNumber: number | null;
  cleanName: string;
  note: string | null;
} {
  let s = String(raw ?? '').trim();
  if (!s) return { rowNumber: null, cleanName: '', note: null };

  let rowNumber: number | null = null;
  let note: string | null = null;

  // Витягуємо номер: "1.", "1 ", "14.Ковалевська", "26) "
  const numMatch = s.match(/^(\d+)[\.\)\-:\s]+\s*(.*)$/);
  if (numMatch) {
    rowNumber = parseInt(numMatch[1], 10);
    s = numMatch[2].trim();
  }

  // Витягуємо примітку: " - ГОТЕЛЬ", "(ГОТЕЛЬ)", "[Київ]"
  const noteMatch = s.match(/[\s\t]+[-–—]\s+([^\-]+)$/) || s.match(/[\s\t]*\(([^\)]+)\)$/) || s.match(/[\s\t]*\[([^\]]+)\]$/);
  if (noteMatch && noteMatch[1]) {
    note = noteMatch[1].trim();
    s = s.slice(0, s.lastIndexOf(noteMatch[0])).trim();
  }

  const cleanName = cleanPersonName(s);
  return { rowNumber, cleanName, note };
}

export function cleanPersonName(raw: string): string {
  let s = String(raw ?? '')
    .replace(/^[\s#№\d.)\-–—]+/, '')
    .replace(/[`’ʼʻ]/g, "'")
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
  if (!s || s.length < 3 || s.length > 80) return false;
  if (isStatsRow(s) || isCounselorOrMentorRow(s)) return false;
  if (extractTeamNumberFromText(s) !== null) return false;

  const { cleanName } = extractLineDetails(s);
  if (!cleanName || cleanName.length < 3) return false;

  const low = norm(cleanName);
  for (const list of Object.values(SYNONYMS)) {
    if (list.includes(low)) return false;
  }

  const words = cleanName.split(' ').filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;

  const namePattern = /^[A-Za-zА-Яа-яЄєІіЇїҐґ'`ʼ\-]+$/;
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

/* ---------- Динамічне завантаження PDF.js через CDN ---------- */

let pdfjsLoadingPromise: Promise<any> | null = null;

async function getPdfJsLib(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;

  if (pdfjsLoadingPromise) return pdfjsLoadingPromise;

  pdfjsLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdfjs]');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).pdfjsLib));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.setAttribute('data-pdfjs', 'true');
    script.async = true;

    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib && lib.GlobalWorkerOptions) {
        lib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      resolve(lib);
    };

    script.onerror = () => {
      // Fallback на unpkg CDN
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
      fallbackScript.async = true;
      fallbackScript.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (lib && lib.GlobalWorkerOptions) {
          lib.GlobalWorkerOptions.workerSrc =
            'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
        resolve(lib);
      };
      fallbackScript.onerror = () => reject(new Error('Не вдалося завантажити бібліотеку PDF.js'));
      document.head.appendChild(fallbackScript);
    };

    document.head.appendChild(script);
  });

  return pdfjsLoadingPromise;
}

/* ---------- Конвертація файлів та PDF у матрицю ---------- */

export function matrixFromCsv(csv: string): any[][] {
  const wb = XLSX.read(csv, { type: 'string', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
}

export function matrixFromRawText(text: string): any[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
      if (line.includes(';') && !line.includes(',')) return line.split(';').map((c) => c.trim());
      return [line];
    });
}

/**
 * Читає PDF сторінка за сторінкою, точно групує текст по координатах Y та X
 */
export async function matrixFromPdf(fileOrBuffer: File | ArrayBuffer | Uint8Array): Promise<any[][]> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else if (fileOrBuffer instanceof Uint8Array) {
    arrayBuffer = fileOrBuffer.buffer;
  } else {
    arrayBuffer = fileOrBuffer;
  }

  try {
    const pdfjsLib = await getPdfJsLib();
    if (!pdfjsLib) throw new Error('PDF.js недоступний');

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const allLines: any[][] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      interface RawItem {
        str: string;
        x: number;
        y: number;
      }

      const items: RawItem[] = (textContent.items as any[])
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({
          str: it.str.trim(),
          x: it.transform[4],
          y: Math.round(it.transform[5]),
        }));

      // Групуємо елементи по координаті Y з точністю до 4px (один рядок)
      const lineGroups: { y: number; items: RawItem[] }[] = [];
      for (const item of items) {
        let group = lineGroups.find((g) => Math.abs(g.y - item.y) <= 4);
        if (!group) {
          group = { y: item.y, items: [] };
          lineGroups.push(group);
        }
        group.items.push(item);
      }

      // Сортуємо рядки зверху вниз (Y спадає)
      lineGroups.sort((a, b) => b.y - a.y);

      for (const group of lineGroups) {
        // У межах одного рядка сортуємо зліва направо (X зростає)
        group.items.sort((a, b) => a.x - b.x);
        const rowText = group.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
        if (rowText) {
          allLines.push([rowText]);
        }
      }
    }

    return allLines;
  } catch (err) {
    console.warn('PDF.js parsing failed, attempting raw text extraction:', err);
    // Резервний парсер сирих текстових блоків PDF
    try {
      const decoder = new TextDecoder('latin1');
      const text = decoder.decode(new Uint8Array(arrayBuffer));
      const extractedMatches = text.match(/\(([^()]+)\)\s*Tj/g) || text.match(/\[([^\[\]]+)\]\s*TJ/g);
      if (extractedMatches && extractedMatches.length > 0) {
        const rawStrings = extractedMatches
          .map((m) => m.replace(/^[\(\[]/, '').replace(/[\)\]]\s*T[jJ]$/, '').trim())
          .filter(Boolean);
        return rawStrings.map((str) => [str]);
      }
    } catch (fallbackErr) {
      console.error('Fallback PDF parser failed:', fallbackErr);
    }
    return [];
  }
}

export async function matrixFromFile(file: File): Promise<any[][]> {
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (isPdf) {
    return matrixFromPdf(file);
  }
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

/* ---------- Ручний парсер з кастомним мапінгом ---------- */

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

      if (key === 'full_name') {
        const details = extractLineDetails(String(val));
        fullName = details.cleanName;
        if (details.note && !note) note = details.note;
        if (details.rowNumber && !rowNumber) rowNumber = details.rowNumber;
      } else if (key === 'team_number') {
        teamNumber = parseIntSafe(val) ?? extractTeamNumberFromText(String(val));
      } else if (key === 'phone') {
        phone = normalizePhone(val);
      } else if (key === 'is_present') {
        presence = normalizePresence(val);
      } else if (key === 'team_name') {
        teamName = String(val).trim();
      } else if (key === 'note_from_table') {
        note = String(val).trim();
      } else if (key === 'row_number') {
        rowNumber = parseIntSafe(val);
      }
    });

    if (!fullName) {
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
      const headerName = String(
        matrix[Math.max(0, startRow - 1)]?.[parseInt(colIdx, 10)] || `Колонка ${parseInt(colIdx, 10) + 1}`
      );
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

/* ---------- Інтелектуальний блоковий парсер ---------- */

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

    // Назва проєкту команди (наприклад: "МАН + Сайт", "КПДЮ + Сайт")
    if (!currentTeamName && cell0 && !isLikelyPersonName(cell0)) {
      if (cell0.length < 80 && !/^\d+$/.test(cell0)) {
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
      const rawText = cells[nameIdx];
      const { rowNumber: extractedRowNum, cleanName: fullName, note: inlineNote } = extractLineDetails(rawText);

      rowNumberInTeam = extractedRowNum ?? (rowNumberInTeam + 1);

      let phone: string | null = null;
      let presence = false;
      let note: string | null = inlineNote;

      for (let c = 0; c < cells.length; c++) {
        if (c === nameIdx) continue;
        const val = cells[c];
        if (!val) continue;

        if (!phone && normalizePhone(val) && val.replace(/\D/g, '').length >= 9) {
          phone = normalizePhone(val);
        } else if (TRUES.includes(norm(val)) || FALSES.includes(norm(val))) {
          presence = normalizePresence(val);
        } else if (!note && val.length > 1 && val !== String(rowNumberInTeam)) {
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
    headers: ['ПІБ', 'Команда', 'Телефон', 'Присутність', 'Проєкт', 'Примітка'],
    headerMap: {
      'ПІБ': 'full_name',
      'Команда': 'team_number',
      'Телефон': 'phone',
      'Присутність': 'is_present',
      'Проєкт': 'team_name',
      'Примітка': 'note_from_table',
    },
    mapSource: 'block',
    skipped,
    detectedTeams: detectTeams(rows),
    matrix,
  };
}

/* ---------- Класичний табличний парсер ---------- */

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

    let rawName = String(colOf.full_name !== undefined ? r[colOf.full_name] ?? '' : '').trim();
    if (!rawName) {
      for (let c = 0; c < Math.min(3, r.length); c++) {
        if (isLikelyPersonName(String(r[c] ?? ''))) {
          rawName = String(r[c]);
          break;
        }
      }
    }

    const { rowNumber: extractedRowNum, cleanName: fullName, note: inlineNote } = extractLineDetails(rawName);

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
    const note = colOf.note_from_table !== undefined ? String(r[colOf.note_from_table] ?? '').trim() || inlineNote : inlineNote;
    const rowNumber = colOf.row_number !== undefined ? parseIntSafe(r[colOf.row_number]) ?? extractedRowNum : extractedRowNum;

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
      row_number: rowNumber ?? rows.length + 1,
      team_number: teamNum,
      full_name: fullName,
      phone,
      team_name: colOf.team_name !== undefined ? String(r[colOf.team_name] ?? '').trim() || null : null,
      note_from_table: note,
      raw_data,
      _issues: issues,
      _sourceRow: i + 1,
    };

    if (fullName) seen.set(key, row);
    rows.push(row);
  }

  return { rows, skipped };
}

/* ---------- Головна функція парсингу списків ---------- */

export function buildRows(
  matrix: any[][],
  headerIdx: number = -1,
  headerMap: Record<string, StdKey> = {}
): ImportResult {
  if (!matrix || matrix.length === 0) {
    return {
      rows: [],
      headers: [],
      headerMap: {},
      mapSource: 'manual',
      skipped: 0,
      detectedTeams: [],
      matrix: [],
    };
  }

  // 1. Спроба розпарсити блоковий/PDF список
  const blockResult = parseBlockFormat(matrix);
  if (blockResult && blockResult.rows.length >= 1) {
    return blockResult;
  }

  // 2. Класична таблиця
  const effectiveHeaderIdx = headerIdx >= 0 ? headerIdx : detectHeaderIndex(matrix);
  const effectiveMap =
    Object.keys(headerMap).length > 0
      ? headerMap
      : localHeaderMap((matrix[effectiveHeaderIdx >= 0 ? effectiveHeaderIdx : 0] || []).map(String));

  const { rows, skipped } = parseClassicTable(matrix, effectiveHeaderIdx >= 0 ? effectiveHeaderIdx : 0, effectiveMap);

  return {
    rows,
    headers: Object.keys(effectiveMap),
    headerMap: effectiveMap,
    mapSource: effectiveHeaderIdx >= 0 ? 'local' : 'manual',
    skipped,
    detectedTeams: detectTeams(rows),
    matrix,
  };
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
