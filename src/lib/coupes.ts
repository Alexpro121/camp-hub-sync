import { normalizeName } from '@/lib/normalize';
import type { PassengerRole } from '@/lib/passengerRoles';
import { normalizeLine, parseSeatLine, parseSequentialTrainText } from '@/lib/train-parser';

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
  passenger_role?: PassengerRole;
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
    const line = normalizeLine(raw);
    if (!line) continue;

    const teamMatch = line.match(/^(?:команда|загін|отряд|team)\s*[№#:]?\s*(\d{1,3})\b/i);
    if (teamMatch) {
      team = parseInt(teamMatch[1], 10);
      teams.add(team);
      continue;
    }

    const parsed = parseSeatLine(line);
    if (!parsed) { skipped++; continue; }
    const { seatNumber: seat, name, boardingCity: city } = parsed;

    if (team) teams.add(team);
    passengers.push({
      seat_number: seat,
      name,
      boarding_city: city,
      coupe_number: coupeOf(seat),
      team_number: team,
      passenger_role: parsed.passengerRole,
    });
  }

  return {
    passengers,
    teams: Array.from(teams).sort((a, b) => a - b),
    source: 'local',
    skipped,
  };
}

/**
 * Main entry: numbered lists win when present, otherwise the sequential
 * positional parser (one line = one seat, placeholders still consume a seat).
 */
export function parseCoupes(text: string, defaultTeam = 0): CoupeParseResult {
  const numbered = parseCoupesDeterministic(text, defaultTeam);
  if (numbered.passengers.length) return numbered;

  const seq = parseSequentialTrainText(text);
  const passengers: CoupePassenger[] = seq.map((p) => ({
    seat_number: p.seatNumber,
    name: p.name,
    boarding_city: p.boardingCity,
    coupe_number: p.coupeNumber,
    team_number: p.teamNumber || defaultTeam,
    passenger_role: p.passengerRole,
  }));
  return {
    passengers,
    teams: Array.from(new Set(passengers.map((p) => p.team_number))).sort((a, b) => a - b),
    source: 'local',
    skipped: 0,
  };
}

/** Group flat passengers into ordered coupes. */
export function groupByTeamThenCoupe<T extends { team_number: number; coupe_number: number; seat_number?: number | null }>(rows: T[]) {
  const byTeam = new Map<number, T[]>();
  for (const r of rows) {
    const arr = byTeam.get(r.team_number) || [];
    arr.push(r);
    byTeam.set(r.team_number, arr);
  }
  return Array.from(byTeam.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([team_number, list]) => ({
      team_number,
      total: list.length,
      coupes: groupByCoupe(list),
    }));
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