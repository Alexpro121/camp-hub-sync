export interface ParsedScheduleItem {
  time_start: string | null;
  time_end: string | null;
  title: string;
  description: string | null;
  target_teams: number[];
}

const TIME_RANGE = /(\d{1,2})[:.](\d{2})\s*(?:-|–|—|до)\s*(\d{1,2})[:.](\d{2})/;
const TIME_SINGLE = /(\d{1,2})[:.](\d{2})/;
const DATE_LINE = /^\s*(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\s*$/;

const pad = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

/** Extracts team numbers mentioned in a chunk of text: "1 і 2 команда", "команди 3-5", "4, 6 команда". */
export function extractTeams(text: string): number[] {
  const lower = text.toLowerCase().replace(/\b\d{1,2}[:.]\d{2}\b/g, '');
  const teams = new Set<number>();
  const numbers = String.raw`\d{1,2}(?:\s*(?:[,іийта]+|[-–—])\s*\d{1,2})*`;
  const expressions = new RegExp(`(${numbers})\\s*команд[а-яіїєґ]*|команд[а-яіїєґ]*\\s*(${numbers})`, 'g');
  for (const match of lower.matchAll(expressions)) {
    const expression = match[1] ?? match[2];
    for (const part of expression.split(/\s*(?:,|і|та|й)\s*/)) {
      const bounds = part.split(/\s*[-–—]\s*/).map(Number);
      const from = bounds[0];
      const to = bounds[1] ?? from;
      if (from >= 1 && to <= 99 && to >= from) for (let n = from; n <= to; n++) teams.add(n);
    }
  }

  return Array.from(teams).sort((a, b) => a - b);
}

/** Detects a leading date line like "26.02" and returns ISO date (current or given year). */
export function extractDate(text: string, year = new Date().getFullYear()): string | null {
  for (const line of text.split('\n')) {
    const m = line.match(DATE_LINE);
    if (m) {
      const d = m[1].padStart(2, '0');
      const mo = m[2].padStart(2, '0');
      let y = m[3] ? parseInt(m[3], 10) : year;
      if (y < 100) y += 2000;
      return `${y}-${mo}-${d}`;
    }
    const inline = line.match(/^\s*(\d{1,2})[.\/](\d{1,2})\b/);
    if (inline && !line.match(/[:.]\d{2}/)) {
      return `${year}-${inline[2].padStart(2, '0')}-${inline[1].padStart(2, '0')}`;
    }
  }
  return null;
}

export function parseScheduleText(raw: string): ParsedScheduleItem[] {
  const items: ParsedScheduleItem[] = [];
  const lines = raw
    .split(/\n|(?:\s+•\s+)/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (DATE_LINE.test(line)) continue;

    let rest = line;
    let start: string | null = null;
    let end: string | null = null;

    // strip leading date prefix like "26.02 07:45 - йога"
    rest = rest.replace(/^\s*\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?\s+/, '');

    const range = rest.match(TIME_RANGE);
    if (range) {
      start = pad(range[1], range[2]);
      end = pad(range[3], range[4]);
      rest = rest.slice(0, range.index).trim() + ' ' + rest.slice((range.index ?? 0) + range[0].length);
    } else {
      const single = rest.match(TIME_SINGLE);
      if (single) {
        start = pad(single[1], single[2]);
        rest = rest.slice(0, single.index).trim() + ' ' + rest.slice((single.index ?? 0) + single[0].length);
      }
    }

    rest = rest.replace(/^[\s\-–—:•]+/, '').replace(/[\s\-–—:]+$/, '').trim();
    if (!rest && !start) continue;

    const target_teams = extractTeams(rest);

    // split "title - description"
    const parts = rest.split(/\s+[-–—]\s+/);
    const title = (parts[0] || rest || 'Подія').trim();
    const description = parts.length > 1 ? parts.slice(1).join(' — ').trim() : null;

    items.push({ time_start: start, time_end: end, title: title || 'Подія', description, target_teams });
  }

  return items;
}
/** Never throws: wraps parseScheduleText in a typed Result. */
export function safeParseScheduleText(raw: string): import('@/lib/schemas/apiSchemas').Result<ParsedScheduleItem[]> {
  try {
    return { ok: true, value: parseScheduleText(raw) };
  } catch (e: any) {
    return { ok: false, error: { code: 'schedule_text', message: e?.message || String(e) } };
  }
}
