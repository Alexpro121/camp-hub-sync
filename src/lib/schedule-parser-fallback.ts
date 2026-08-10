import { parseScheduleText, extractDate, extractTeams, type ParsedScheduleItem } from './scheduleParser';
import { toMinutes } from './scheduleCategories';

export type ScheduleCategory = 'sports' | 'meal' | 'gathering' | 'entertainment' | 'transfer' | 'fair' | 'general';

export interface SubSlot {
  time: string;
  teams: number[];
}

export interface AiScheduleItem extends ParsedScheduleItem {
  category: ScheduleCategory;
  has_sub_slots: boolean;
  sub_slots: SubSlot[];
}

export const TIME_RE = /(\d{1,2}[:.]\d{2})\s*(?:(?:-|–|—|до)\s*(\d{1,2}[:.]\d{2}))?/;
export const TEAM_RE = /(\d+)(?:\s*,|\s*і|\s*та)*\s*команда/g;

const RULES: Array<[ScheduleCategory, RegExp]> = [
  ['fair', /ярмарок|ярмарк|маркет|fair|market|продаж смаколик/i],
  ['meal', /сніданок|обід|вечер|полуден|чай|їж|харчув/i],
  ['sports', /йога|зарядк|підйом|спорт|футбол|волейбол|скеледром|басейн|бассейн|біг|естафет|медицин/i],
  ['gathering', /свічк|сінемалог|акторськ|футболк|розпис|збір|лінійк|переклич|шикув|нарад/i],
  ['entertainment', /дискотек|кіно|талант|концерт|квест|гра|вечір|шоу/i],
  ['transfer', /виїзд|переїзд|потяг|поїзд|автобус|трансфер|буковел|прибутт|від'їзд|поверненн/i],
];

export function detectCategory(text: string): ScheduleCategory {
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'general';
}

const toMin = (t?: string | null) => toMinutes(t);

/** A line like "16:45 - 3 і 4 команда" carries teams but no real activity name. */
const isTeamOnly = (title: string, description: string | null, teams: number[]) => {
  if (!teams.length) return false;
  const text = `${title} ${description ?? ''}`
    .toLowerCase()
    .replace(/команд\w*/g, '')
    .replace(/[\d\s,.:;–—-]|\bі\b|\bта\b|\bй\b/g, '')
    .trim();
  return text.length <= 2;
};

/** Groups staggered team lines under the preceding main event (meal, fair, shower…). */
export function groupSubSlots(items: AiScheduleItem[]): AiScheduleItem[] {
  const out: AiScheduleItem[] = [];
  for (const it of items) {
    const parent = out[out.length - 1];
    const start = toMin(it.time_start);
    const pStart = toMin(parent?.time_start ?? null);
    const pEnd = toMin(parent?.time_end ?? null);
    const fits =
      parent && start != null && pStart != null && pEnd != null && start >= pStart && start <= pEnd;
    if (fits && isTeamOnly(it.title, it.description, it.target_teams)) {
      parent.has_sub_slots = true;
      parent.sub_slots = [...parent.sub_slots, { time: it.time_start as string, teams: it.target_teams }];
      continue;
    }
    out.push(it);
  }
  return out;
}

/**
 * Every event must render as HH:MM – HH:MM. When the source gives only a start
 * time, derive the end from the next event (capped at 2h) or default to +1h.
 */
function fillMissingEnds(items: AiScheduleItem[]): AiScheduleItem[] {
  const pad = (m: number) =>
    `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return items.map((it, i) => {
    if (it.time_end) return it;
    const start = toMin(it.time_start);
    if (start == null) return it;
    const nextStart = toMin(items[i + 1]?.time_start ?? null);
    const gap = nextStart != null && nextStart > start ? nextStart - start : 60;
    return { ...it, time_end: pad(start + Math.min(gap, 120)) };
  });
}

const HAS_TIME = /\d{1,2}[:.]\d{2}/;

/**
 * A header line of a circular system block: mentions teams, carries no time and
 * (optionally) an activity name — e.g. "4 команди" or "1, 3, 5 та 6 команди - тактична медицина".
 * Its teams stick to every following timed line until the next header.
 */
function readTeamHeader(line: string): { teams: number[]; activity: string | null } | null {
  if (HAS_TIME.test(line)) return null;
  const teams = extractTeams(line);
  if (!teams.length) return null;
  const activity = line
    .split(/\s+[-–—:]\s+/)
    .slice(1)
    .join(' — ')
    .trim();
  return { teams, activity: activity || null };
}

/** Local regex fallback: never throws, always returns something usable. */
export function fallbackParse(raw: string): { items: AiScheduleItem[]; date: string | null } {
  const parsed: AiScheduleItem[] = [];
  let stickyTeams: number[] = [];
  let stickyActivity: string | null = null;

  for (const line of (raw ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const header = readTeamHeader(trimmed);
    if (header) {
      stickyTeams = header.teams;
      stickyActivity = header.activity;
      // A header that already names an activity but has no time is not an event by itself.
      continue;
    }

    for (const it of parseScheduleText(trimmed)) {
      const teams = it.target_teams.length ? it.target_teams : stickyTeams;
      const title = it.title && it.title !== 'Подія' ? it.title : (stickyActivity ?? it.title);
      parsed.push({
        ...it,
        title,
        target_teams: teams,
        category: detectCategory(`${title} ${it.description ?? ''}`),
        has_sub_slots: false,
        sub_slots: [],
      });
    }
  }

  return { items: fillMissingEnds(groupSubSlots(parsed)), date: extractDate(raw) };
}

export { extractTeams };
