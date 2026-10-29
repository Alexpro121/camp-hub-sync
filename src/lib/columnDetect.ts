/**
 * Визначення колонок таблиці за ВМІСТОМ, а не лише за заголовками.
 * Потрібне, коли заголовків немає, вони нестандартні («Хто», «Col A») або складені з помилками.
 */
import {
  extractTeamNumberFromText,
  isLikelyPersonName,
  isPresenceToken,
  localHeaderMap,
  normalizePhone,
  type StdKey,
} from '@/lib/importer';

export interface ColumnProfile {
  index: number;
  filled: number;
  name: number;
  phone: number;
  team: number;
  presence: number;
  sequence: number;
  distinct: number;
}

const cellText = (v: unknown) => String(v ?? '').trim();

const looksLikePhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 13 && digits.length / v.replace(/\s/g, '').length >= 0.6 && normalizePhone(v) !== null;
};

/** Профілі колонок за рядками даних (до maxRows для швидкодії на великих файлах). */
export function profileColumns(matrix: any[][], startRow: number, maxRows = 300): ColumnProfile[] {
  const rows = matrix.slice(startRow, startRow + maxRows);
  const width = rows.reduce((w, r) => Math.max(w, (r || []).length), 0);
  const out: ColumnProfile[] = [];

  for (let c = 0; c < width; c++) {
    const values = rows.map((r) => cellText((r || [])[c])).filter(Boolean);
    const filled = values.length;
    if (!filled) {
      out.push({ index: c, filled: 0, name: 0, phone: 0, team: 0, presence: 0, sequence: 0, distinct: 0 });
      continue;
    }

    let name = 0, phone = 0, team = 0, presence = 0, stepUp = 0, ints = 0;
    let prev: number | null = null;
    for (const v of values) {
      if (looksLikePhone(v)) phone++;
      if (isLikelyPersonName(v)) name += v.split(/\s+/).filter(Boolean).length >= 2 ? 1 : 0.4;
      if (/^\d{1,2}$/.test(v) && +v >= 1 && +v <= 98) team++;
      else if (/(команд|загін|загон|team|група)/i.test(v) && extractTeamNumberFromText(v) !== null) team++;
      if (!/^\d+$/.test(v) && isPresenceToken(v)) presence++;
      if (/^\d{1,4}$/.test(v)) {
        ints++;
        const n = +v;
        if (prev !== null && n === prev + 1) stepUp++;
        prev = n;
      }
    }
    out.push({
      index: c,
      filled,
      name: name / filled,
      phone: phone / filled,
      team: team / filled,
      presence: presence / filled,
      sequence: ints >= 3 ? stepUp / Math.max(1, ints - 1) : 0,
      distinct: new Set(values).size,
    });
  }
  return out;
}

/**
 * Підбирає колонки для ще не розпізнаних ключів.
 * `taken` — ключі, що вже визначені заголовками; `blocked` — колонки, що вже мають значення.
 */
export function inferColumnKeys(
  profiles: ColumnProfile[],
  taken: Set<StdKey>,
  blocked: Set<number>,
): Partial<Record<StdKey, number>> {
  const result: Partial<Record<StdKey, number>> = {};
  const free = () => profiles.filter((p) => p.filled > 0 && !blocked.has(p.index) && !Object.values(result).includes(p.index));
  const best = (score: (p: ColumnProfile) => number, min: number) => {
    let top: ColumnProfile | null = null;
    let topScore = min;
    for (const p of free()) {
      const sc = score(p);
      if (sc >= topScore && (!top || sc > topScore)) { top = p; topScore = sc; }
    }
    return top;
  };

  if (!taken.has('full_name')) {
    const p = best((x) => x.name, 0.6);
    if (p) result.full_name = p.index;
  }
  if (!taken.has('phone')) {
    const p = best((x) => x.phone, 0.6);
    if (p) result.phone = p.index;
  }
  if (!taken.has('row_number')) {
    const p = best((x) => (x.sequence >= 0.8 && x.distinct >= x.filled * 0.9 ? x.sequence : 0), 0.8);
    if (p) result.row_number = p.index;
  }
  if (!taken.has('team_number')) {
    // Команди повторюються (багато дітей на команду), на відміну від порядкових номерів.
    const p = best((x) => (x.team >= 0.85 && x.distinct <= 60 && x.distinct < x.filled * 0.7 && x.sequence < 0.8 ? x.team : 0), 0.85);
    if (p) result.team_number = p.index;
  }
  if (!taken.has('is_present')) {
    const p = best((x) => x.presence, 0.9);
    if (p) result.is_present = p.index;
  }
  return result;
}

export interface InferredTable {
  matrix: any[][];
  headerIdx: number;
  headerMap: Record<string, StdKey>;
  /** Заголовків не було: додано рядок «Колонка 1…», перший рядок даних лишився даними. */
  synthetic: boolean;
}

/**
 * Доповнює мапінг заголовків аналізом вмісту. Якщо заголовків немає зовсім —
 * додає синтетичний рядок, щоб перший рядок даних не загубився.
 */
export function inferTable(matrix: any[][], headerIdx: number, headerMap: Record<string, StdKey>): InferredTable {
  const firstRow = (matrix[Math.max(0, headerIdx)] || []).map(cellText);
  const headerless = headerIdx < 0 && firstRow.some((c) => isLikelyPersonName(c) && !Object.keys(localHeaderMap([c])).length);

  let work = matrix;
  let idx = headerIdx;
  let map = { ...headerMap };
  if (headerless) {
    const width = matrix.reduce((w, r) => Math.max(w, (r || []).length), 0);
    work = [Array.from({ length: width }, (_, i) => `Колонка ${i + 1}`), ...matrix];
    idx = 0;
    map = {};
  } else if (idx < 0) {
    idx = 0;
  }

  const headers = (work[idx] || []).map(cellText);
  const taken = new Set<StdKey>(Object.values(map));
  const blocked = new Set<number>();
  headers.forEach((h, i) => { if (h && map[h]) blocked.add(i); });

  const inferred = inferColumnKeys(profileColumns(work, idx + 1), taken, blocked);
  for (const [key, col] of Object.entries(inferred) as [StdKey, number][]) {
    const header = headers[col] || `Колонка ${col + 1}`;
    if (!headers[col]) {
      work = work.map((r, i) => (i === idx ? Object.assign([...(r || [])], { [col]: header }) : r));
    }
    if (!map[header]) map[header] = key;
  }
  return { matrix: work, headerIdx: idx, headerMap: map, synthetic: headerless };
}
