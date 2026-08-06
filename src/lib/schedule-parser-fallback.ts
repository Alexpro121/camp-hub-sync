import { parseScheduleText, extractDate, extractTeams, type ParsedScheduleItem } from './scheduleParser';

export type ScheduleCategory = 'sports' | 'meal' | 'gathering' | 'entertainment' | 'transfer' | 'general';

export interface AiScheduleItem extends ParsedScheduleItem {
  category: ScheduleCategory;
}

export const TIME_RE = /(\d{1,2}:\d{2})\s*(?:-\s*(\d{1,2}:\d{2}))?/;
export const TEAM_RE = /(\d+)(?:\s*,|\s*і|\s*та)*\s*команда/g;

const RULES: Array<[ScheduleCategory, RegExp]> = [
  ['meal', /сніданок|обід|вечер|полуден|їж|харчув/i],
  ['sports', /йога|зарядк|спорт|футбол|волейбол|скеледром|басейн|біг|естафет/i],
  ['gathering', /збір|лінійк|переклич|шикув|нарад/i],
  ['entertainment', /дискотек|кіно|талант|концерт|квест|гра|вечір|шоу/i],
  ['transfer', /виїзд|переїзд|автобус|трансфер|прибутт|від'їзд|поверненн/i],
];

export function detectCategory(text: string): ScheduleCategory {
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'general';
}

/** Local regex fallback: never throws, always returns something usable. */
export function fallbackParse(raw: string): { items: AiScheduleItem[]; date: string | null } {
  const items = parseScheduleText(raw).map((it) => ({
    ...it,
    category: detectCategory(`${it.title} ${it.description ?? ''}`),
  }));
  return { items, date: extractDate(raw) };
}

export { extractTeams };
