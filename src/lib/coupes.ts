import { normalizeName } from '@/lib/normalize';

export const SEATS_PER_COUPE = 4;

export interface CoupePassenger {
  seat_number: number;
  /** Name exactly as written in the source document — never rewritten. */
  name: string;
  boarding_city: string | null;
  coupe_number: number;
  team_number: number;
  /** Filled by the verification step. */
  child_id?: string | null;
  matched?: boolean;
}

export interface CoupeParseResult {
  passengers: CoupePassenger[];
  teams: number[];
  source: 'local' | 'ai';
  skipped: number;
}

/** Strict formula: seats 1–4 → coupe 1, 5–8 → coupe 2, … */
export function coupeOf(seat: number): number {
  return Math.ceil(seat / SEATS_PER_COUPE);
}

const EMPTY_MARKERS = /^(\.{1,}|-{1,}|—|ss|сс|вільно|free)$/i;

/** Normalize tabs, non-breaking spaces and exotic whitespace before parsing. */
function cleanLine(raw: string): string {
  return String(raw)
    .replace(/\u00A0|\u2007|\u202F/g, ' ')
    .replace(/\t/g, '\t')
    .trim();
}

/** Split "Кундик Сергій - Львів" into the name and the boarding city (first dash wins). */
function splitCity(rest: string): { name: string; city: string | null } {
  const parts = rest.split(/\s*[-–—]\s*/);
  if (parts.length < 2) return { name: rest.trim(), city: null };
  const name = parts[0].trim();
  const city = parts.slice(1).join('-').trim();
  if (!name || !city) return { name: rest.trim(), city: null };
  return { name, city };
}

/**
 * Deterministic parser — reads "№. ПІБ - Місто" lines and computes the coupe.
 * Zero mutation: names are kept exactly as written.
 */
export function parseCoupesDeterministic(text: string, defaultTeam = 0): CoupeParseResult {
  const lines = String(text || '').split(/\r?\n/);
  const passengers: CoupePassenger[] = [];
  const teams = new Set<number>();
  let team = defaultTeam;
  let skipped = 0;

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    const teamMatch = line.match(/^(?:команда|загін|отряд|team)\s*[№#:]?\s*(\d{1,3})\b/i);
    if (teamMatch) {
      team = parseInt(teamMatch[1], 10);
      teams.add(team);
      continue;
    }

    // Numbered seat lines only: "12. Name - City", "12) Name", "12<TAB>Name". Headers are ignored.
    const m = line.match(/^(\d{1,3})\s*[.)\t]\s*(.*)$/u);
    if (!m) { skipped++; continue; }

    const seat = parseInt(m[1], 10);
    const rest = m[2].replace(/\t/g, ' ').trim();
    if (!rest || EMPTY_MARKERS.test(rest)) { skipped++; continue; }

    const { name, city } = splitCity(rest);
    if (!name || name.length < 2) { skipped++; continue; }

    if (team) teams.add(team);
    passengers.push({
      seat_number: seat,
      name,
      boarding_city: city,
      coupe_number: coupeOf(seat),
      team_number: team,
    });
  }

  return {
    passengers,
    teams: Array.from(teams).sort((a, b) => a - b),
    source: 'local',
    skipped,
  };
}

/** Group flat passengers into ordered coupes. */
export function groupByCoupe<T extends { coupe_number: number; seat_number?: number | null }>(rows: T[]) {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const arr = map.get(r.coupe_number) || [];
    arr.push(r);
    map.set(r.coupe_number, arr);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([coupe_number, passengers]) => ({
      coupe_number,
      passengers: passengers.sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0)),
    }));
}

export interface RosterChild { id: string; full_name: string; team_number: number }

/** Alias matching the spec name. */
export const parseTrainCoupesText = (rawText: string) => parseCoupesDeterministic(rawText).passengers;

/** Match parsed passengers against the camp roster without altering any name. */
export function verifyAgainstRoster(passengers: CoupePassenger[], roster: RosterChild[]): CoupePassenger[] {
  const byName = new Map<string, RosterChild>();
  for (const c of roster) {
    const key = normalizeName(c.full_name);
    if (key && !byName.has(key)) byName.set(key, c);
  }
  const byTokens = new Map<string, RosterChild>();
  for (const c of roster) {
    const key = normalizeName(c.full_name).split(' ').filter(Boolean).sort().join(' ');
    if (key && !byTokens.has(key)) byTokens.set(key, c);
  }

  return passengers.map((p) => {
    const key = normalizeName(p.name);
    const tokenKey = key.split(' ').filter(Boolean).sort().join(' ');
    const hit = byName.get(key) || byTokens.get(tokenKey) || null;
    return { ...p, child_id: hit?.id ?? null, matched: !!hit };
  });
}