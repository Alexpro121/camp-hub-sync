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

/** Frequent boarding points — an instant match, no heuristics needed. */
const KNOWN_CITIES = new Set([
  'львів', 'івано-франківськ', 'київ', 'тернопіль', 'рівне', 'луцьк', 'хмельницький', 'ужгород',
  'вінниця', 'житомир', 'чернівці', 'коломия', 'стрий', 'дрогобич', 'калуш', 'долина', 'яремче',
  'буковель', 'ходорів', 'красне', 'здолбунів', 'шепетівка', 'козятин', 'фастів', 'миколаїв',
  'одеса', 'харків', 'дніпро', 'запоріжня', 'запоріжжя', 'полтава', 'черкаси', 'кропивницький',
  'суми', 'чернігів', 'херсон', 'ковель', 'сарни', 'дубно', 'броди', 'бердичів', 'мукачево',
]);

/** Suffixes that make a single Ukrainian word almost certainly a settlement. */
const CITY_SUFFIX =
  /(ів|їв|ськ|цьк|ець|поль|град|город|біль|ин|ине|івка|ївка|анка|енко-?)$/iu;

/**
 * Is this standalone line a boarding city rather than a passenger?
 * A city is one or two capitalised words, no initials/patronymic, and either a
 * known name or a recognisable settlement suffix. Any static whitelist would
 * silently drop real stations, so this is heuristic, not a fixed list.
 */
export function looksLikeCityLine(rawLine: string): boolean {
  const line = normalizeLine(rawLine).replace(/^(?:м\.|c\.|с\.|смт\.?|місто)\s*/iu, '').trim();
  if (!line || line.length < 3 || line.length > 32) return false;
  if (/[0-9@()]/.test(line)) return false;
  if (/,/.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > 2) return false;
  if (words.some((w) => /^[\p{Lu}]\.$/u.test(w))) return false; // "І." — initials
  if (!/^[\p{Lu}]/u.test(line)) return false;
  const key = line.toLowerCase();
  if (KNOWN_CITIES.has(key)) return true;
  if (words.length === 2) return false; // two-word names are usually people
  return CITY_SUFFIX.test(key);
}

/** Split "ПІБ - Місто" at the FIRST dash, keeping hyphenated city names intact. */
function splitNameCity(line: string): { name: string; boardingCity: string | null } {
  // Prefer a dash surrounded by spaces so hyphenated surnames stay intact.
  const m = line.match(/^(.*?)\s+[-–—]\s+(.+)$/u) ?? line.match(/^(.*?)\s*[-–—]\s*(.+)$/u);
  if (!m) return { name: line, boardingCity: null };
  const name = m[1].trim();
  const city = m[2].trim();
  if (!name || !city) return { name: line, boardingCity: null };
  return { name, boardingCity: city };
}

/** "Прізвище Ім'я" in Cyrillic or Latin — enough to know the seat list started. */
const NAME_LIKE = /^[\p{Lu}][\p{L}'’-]+\s+[\p{Lu}]/u;
/** Patronymic ending — the strongest signal that the seat list has begun. */
const PATRONYMIC = /(ович|йович|ьович|івна|ївна|инична|івич)\s*$/iu;
/** Surname-like single word ("Баркова", "Шевченко") also opens the seat list. */
const SURNAME_LIKE = /^[\p{Lu}][\p{L}'’-]{3,}(?:ов|ова|ев|єва|енко|ук|юк|ський|ська|ich|чук|ак|ян|іна|ина)$/u;

/**
 * A line before the first seat is a crew/description header unless it clearly
 * looks like a roster entry. Two bare given names ("Аня Вова", "Лідери Дарина")
 * are supervising staff, not passengers.
 */
function startsSeatList(line: string): boolean {
  if (PATRONYMIC.test(line)) return true;
  const words = line.split(/\s+/);
  if (words.length === 1) return SURNAME_LIKE.test(words[0]);
  if (words.length >= 3) return NAME_LIKE.test(line);
  return false;
}
/** Leading numbering: "5.", "5)", "5 " at the start of a seat line. */
const LEADING_NUM = /^(\d{1,3})\s*[.)]\s*/;

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

  const lines = rawText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeLine(lines[i]).replace(/\t+/g, ' ').trim();
    if (!line) continue;

    const teamMatch = line.match(TEAM_REGEX);
    if (teamMatch) {
      currentTeam = parseInt(teamMatch[1], 10);
      seatCounter = 0; // seats restart at 1 for every team (own carriage)
      isParsingSeats = false;
      continue;
    }
    if (currentTeam === null) continue;

    const numbered = line.match(LEADING_NUM);
    const body = numbered ? line.slice(numbered[0].length).trim() : line;
    const isPlaceholder = PLACEHOLDER.test(body) || PLACEHOLDER.test(line);

    // Header lines listing several people through commas
    // ("Даша Мелікян, Лера Березанцева, Сізіков Олексій (каченя)") describe
    // the supervising crew — they are never a seat.
    if (!isParsingSeats && !numbered && line.includes(',') && line.split(',').length >= 2) {
      continue;
    }

    if (!isParsingSeats) {
      if (numbered || isPlaceholder || startsSeatList(splitNameCity(body).name)) {
        isParsingSeats = true;
      } else {
        continue; // header/description line ("МАН + Сайт", "Лідери…")
      }
    }

    // Explicit numbering in the source wins over the running counter.
    seatCounter = numbered ? parseInt(numbered[1], 10) : seatCounter + 1;
    if (seatCounter > 40) continue;
    if (isPlaceholder) continue;

    let { name, boardingCity } = splitNameCity(body);
    // City written on its own line right below the passenger
    if (!boardingCity && i + 1 < lines.length) {
      const next = normalizeLine(lines[i + 1]).replace(/^(?:м\.|с\.|смт\.?)\s*/iu, '').trim();
      if (looksLikeCityLine(lines[i + 1])) {
        boardingCity = next;
        i++;
      }
    }
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

export interface TeamTrainDisposition {
  teamNumber: number;
  totalPassengers: number;
  coupes: { coupeNumber: number; passengers: Required<ParsedPassenger>[] }[];
}

/** Sequential parse grouped per team: every team gets its own coupes 1..10. */
export function parseTrainTextGroupedByTeams(rawText: string): TeamTrainDisposition[] {
  const flat = parseSequentialTrainText(rawText);
  const teams = new Map<number, Required<ParsedPassenger>[]>();
  for (const p of flat) {
    const arr = teams.get(p.teamNumber) || [];
    arr.push(p);
    teams.set(p.teamNumber, arr);
  }
  return Array.from(teams.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([teamNumber, passengers]) => {
      const maxCoupe = Math.max(10, ...passengers.map((p) => p.coupeNumber));
      const coupes = Array.from({ length: maxCoupe }, (_, i) => ({
        coupeNumber: i + 1,
        passengers: passengers
          .filter((p) => p.coupeNumber === i + 1)
          .sort((a, b) => a.seatNumber - b.seatNumber),
      }));
      return { teamNumber, totalPassengers: passengers.length, coupes };
    });
}
