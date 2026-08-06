/** Deterministic train seating parser (Stage 1 — Smart Regex, no AI). */

export interface ParsedPassenger {
  seatNumber: number;
  coupeNumber: number;
  name: string;
  boardingCity: string | null;
}

/** Numbered seat line: "5. Ім'я", "5) Ім'я", "5<TAB>Ім'я". */
const LINE_REGEX = /^\s*(\d{1,2})\s*[.)\t]\s*(.*)$/u;
const EMPTY = /^(\.{1,3}|-{1,3}|—|–|ss|сс|вільно|free)$/i;

/** Normalize tabs, non-breaking spaces and exotic whitespace. */
export function normalizeLine(line: string): string {
  return String(line ?? '')
    .replace(/[\u00A0\u2007\u202F\u2000-\u200B]/g, ' ')
    .replace(/\t+/g, '\t')
    .trim();
}

/** Parse a single line; returns null for headers and empty seats. */
export function parseSeatLine(rawLine: string): ParsedPassenger | null {
  const cleanLine = normalizeLine(rawLine);
  if (!cleanLine) return null;

  const match = cleanLine.match(LINE_REGEX);
  if (!match) return null; // headers: "Команда 5", "МАН + Сайт", "Валера..."

  const seatNumber = parseInt(match[1], 10);
  if (!seatNumber || seatNumber < 1 || seatNumber > 99) return null;

  const content = match[2].replace(/\t/g, ' ').trim();
  if (!content || EMPTY.test(content)) return null;

  let name = content;
  let boardingCity: string | null = null;
  if (/[-–—]/.test(content)) {
    const parts = content.split(/\s*[-–—]\s*/);
    const head = parts[0].trim();
    const tail = parts.slice(1).join('-').trim();
    if (head && tail) {
      name = head;
      boardingCity = tail;
    }
  }

  if (name.length < 2) return null;

  return { seatNumber, coupeNumber: Math.ceil(seatNumber / 4), name, boardingCity };
}

/** Parse a whole seating list. Headers and service markers are ignored. */
export function parseTrainCoupesLocal(rawText: string): ParsedPassenger[] {
  if (!rawText || typeof rawText !== 'string') return [];
  const out: ParsedPassenger[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    const p = parseSeatLine(line);
    if (p) out.push(p);
  }
  return out;
}
