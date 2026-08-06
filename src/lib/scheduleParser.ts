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
  const lower = text.toLowerCase();
  if (!/команд/.test(lower)) return [];
  const teams = new Set<number>();

  // ranges: "3-5 команда" / "команди 3-5"
  for (const m of lower.matchAll(/(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})\s*(?=команд)/g)) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a && b && b >= a && b - a < 30) for (let i = a; i <= b; i++) teams.add(i);
  }

  // enumerations before the word "команда": "1 і 2 команда", "1, 2, 3 команди"
  const before = lower.split(/команд/)[0] ?? '';
  const tail = before.slice(-40);
  for (const m of tail.matchAll(/\b(\d{1,2})\b/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 40) teams.add(n);
  }

  // "команда 7" / "команди 7 та 8"
  const after = lower.split(/команд\w*/)[1] ?? '';
  for (const m of after.slice(0, 25).matchAll(/\b(\d{1,2})\b/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 40) teams.add(n);
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