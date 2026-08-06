/** Deterministic train seating parser (Stage 1 — Smart Regex, no AI). */

export interface ParsedPassenger {
  seatNumber: number;
  coupeNumber: number;
  name: string;
  boardingCity: string | null;
  teamNumber?: number;
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

const TEAM_REGEX = /^(?:команда|загін|отряд|team)\s*[№#:]?\s*(\d{1,3})/i;
const PLACEHOLDER = /^(\.{1,3}|-{1,3}|—|–|ss|сс|вільно|free)$/i;

/** Cities that may appear on their own line right under a passenger. */
const CITY_LINES = ['львів', 'івано-франківськ', 'київ', 'тернопіль', 'рівне', 'луцьк', 'хмельницький', 'ужгород'];

/** Split "ПІБ - Місто" at the FIRST dash, keeping hyphenated city names intact. */
function splitNameCity(line: string): { name: string; boardingCity: string | null } {
  const m = line.match(/^(.*?)\s*[-–—]\s*(.+)$/u);
  if (!m) return { name: line, boardingCity: null };
  const name = m[1].trim();
  const city = m[2].trim();
  if (!name || !city) return { name: line, boardingCity: null };
  return { name, boardingCity: city };
}

/**
 * Sequential positional parser: no seat numbers in the source.
 * Every line after a team header is one seat (1..40); ".", "..", "SS" are
 * empty/service seats — they still advance the counter.
 */
export function parseSequentialTrainText(rawText: string): Required<ParsedPassenger>[] {
  if (!rawText || typeof rawText !== 'string') return [];
  const result: Required<ParsedPassenger>[] = [];
  let currentTeam: number | null = null;
  let seatCounter = 0;
  let isParsingSeats = false;

  for (const raw of rawText.split(/\r?\n/)) {
    const line = normalizeLine(raw).replace(/\t+/g, ' ').trim();
    if (!line) continue;

    const teamMatch = line.match(TEAM_REGEX);
    if (teamMatch) {
      currentTeam = parseInt(teamMatch[1], 10);
      seatCounter = 0;
      isParsingSeats = false;
      continue;
    }
    if (currentTeam === null) continue;

    const isPlaceholder = PLACEHOLDER.test(line);

    if (!isParsingSeats) {
      if (isPlaceholder || /^[А-ЯІЇЄҐ][а-яіїєґ'’-]+\s+[А-ЯІЇЄҐ]/u.test(line)) {
        isParsingSeats = true;
      } else {
        continue; // header/description line ("МАН + Сайт", "Лідери…")
      }
    }

    seatCounter++;
    if (seatCounter > 40) continue;
    if (isPlaceholder) continue;

    const { name, boardingCity } = splitNameCity(line.replace(/^\d{1,2}\s*[.)]\s*/, ''));
    if (name.length < 2) continue;

    result.push({
      teamNumber: currentTeam,
      seatNumber: seatCounter,
      coupeNumber: Math.ceil(seatCounter / 4),
      name,
      boardingCity,
    });
  }

  return result;
}
