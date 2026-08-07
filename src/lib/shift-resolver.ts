import type { Shift, ShiftCategory } from '@/types/app';

export type ShiftPhase = 'PREPARING' | 'TRAVEL_PHASE' | 'JOINT_BUKOVEL_PHASE' | 'FINISHED';

export interface TeamShiftStatus {
  shiftId: string;
  shiftName: string;
  category: ShiftCategory;
  currentPhase: ShiftPhase;
  phaseTitle: string;
  isActiveToday: boolean;
  startDate: string;
  endDate: string;
  hotelStartDate: string | null;
  /** Whole days until the phase that matters for the participant (0 when already started). */
  daysUntilStart: number;
}

export const CATEGORY_LABELS: Record<ShiftCategory, string> = {
  long: 'Довга зміна',
  short: 'Коротка зміна',
  international: 'Міжнародна зміна',
};

/** Default team ranges used when an admin does not type them manually. */
export const DEFAULT_TEAMS: Record<ShiftCategory, number[]> = {
  short: [1, 2, 3, 4, 5, 6],
  long: [7, 8],
  international: [],
};

export function shiftCategoryOf(s: Shift): ShiftCategory {
  return (s.shift_category || s.shift_type || 'short') as ShiftCategory;
}

export function teamsOf(s: Shift): number[] {
  return Array.isArray(s.assigned_teams) && s.assigned_teams.length
    ? s.assigned_teams
    : DEFAULT_TEAMS[shiftCategoryOf(s)];
}

export function parseTeamsInput(raw: string): number[] {
  const out = new Set<number>();
  for (const chunk of raw.split(/[,;\s]+/).filter(Boolean)) {
    const range = chunk.match(/^(\d{1,3})[-–](\d{1,3})$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
      continue;
    }
    const n = parseInt(chunk.replace(/[^\d]/g, ''), 10);
    if (n) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

const DAY = 86_400_000;
const dayStart = (v: string | Date) => {
  const d = typeof v === 'string' ? new Date(`${v}T00:00:00`) : new Date(v);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Phase of a whole shift (independent of team). */
export function resolveShiftPhase(shift: Shift, currentDate: Date = new Date()): TeamShiftStatus {
  const category = shiftCategoryOf(shift);
  const now = dayStart(currentDate);
  const start = dayStart(shift.start_date);
  const end = dayStart(shift.end_date);
  const hotelStart = shift.hotel_start_date ? dayStart(shift.hotel_start_date) : start;

  const base = {
    shiftId: shift.id,
    shiftName: shift.name,
    category,
    startDate: shift.start_date,
    endDate: shift.end_date,
    hotelStartDate: shift.hotel_start_date ?? null,
  };

  if (now < start) {
    return {
      ...base,
      currentPhase: 'PREPARING',
      phaseTitle: 'Підготовка до заїзду',
      isActiveToday: false,
      daysUntilStart: Math.max(0, Math.round((start - now) / DAY)),
    };
  }

  if (category === 'long' && now < hotelStart) {
    return {
      ...base,
      currentPhase: 'TRAVEL_PHASE',
      phaseTitle: 'Етап 1: Подорож Західною Україною',
      isActiveToday: true,
      daysUntilStart: 0,
    };
  }

  if (now >= hotelStart && now <= end) {
    return {
      ...base,
      currentPhase: 'JOINT_BUKOVEL_PHASE',
      phaseTitle: 'Спільна зміна в Буковелі',
      isActiveToday: true,
      daysUntilStart: 0,
    };
  }

  return {
    ...base,
    currentPhase: 'FINISHED',
    phaseTitle: 'Зміна завершена',
    isActiveToday: false,
    daysUntilStart: 0,
  };
}

/** Phase for a specific team — picks the shift this team belongs to. */
export function resolveTeamShiftStatus(
  shifts: Shift[],
  teamNumber: number,
  currentDate: Date = new Date(),
): TeamShiftStatus | null {
  const candidates = shifts.filter((s) => !s.deleted_at && teamsOf(s).includes(teamNumber));
  if (!candidates.length) return null;
  const resolved = candidates.map((s) => resolveShiftPhase(s, currentDate));
  return (
    resolved.find((r) => r.isActiveToday) ||
    resolved.filter((r) => r.currentPhase === 'PREPARING').sort((a, b) => a.daysUntilStart - b.daysUntilStart)[0] ||
    resolved.sort((a, b) => b.endDate.localeCompare(a.endDate))[0]
  );
}

export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дні';
  return 'днів';
}