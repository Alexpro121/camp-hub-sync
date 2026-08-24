export type HallId =
  | 'hall_ab'
  | 'hall_cd'
  | 'grand_hall'
  | 'mirror_hall'
  | 'brick_hall'
  | 'arena'
  | 'pool'
  | 'boxing_hall';

export interface HallConfig {
  id: HallId;
  name: string;
  badgeColor: string;
}

export const HALLS_LIST: HallConfig[] = [
  { id: 'hall_ab', name: 'Зала AB', badgeColor: 'border-sky-500/30 text-sky-400 bg-sky-500/10' },
  { id: 'hall_cd', name: 'Зала CD', badgeColor: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' },
  { id: 'grand_hall', name: 'Велика зала', badgeColor: 'border-amber-500/30 text-amber-400 bg-amber-500/10' },
  { id: 'mirror_hall', name: 'Дзеркальна зала', badgeColor: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
  { id: 'brick_hall', name: 'Цегляна зала', badgeColor: 'border-orange-500/30 text-orange-400 bg-orange-500/10' },
  { id: 'arena', name: 'Манеж', badgeColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
  { id: 'pool', name: 'Басейн', badgeColor: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  { id: 'boxing_hall', name: 'Зал для боксу', badgeColor: 'border-rose-500/30 text-rose-400 bg-rose-500/10' },
];

export const hallName = (id: string): string =>
  HALLS_LIST.find((h) => h.id === id)?.name ?? id;

export const hallBadge = (id: string): string =>
  HALLS_LIST.find((h) => h.id === id)?.badgeColor ??
  'border-border/50 text-muted-foreground bg-muted/30';

export interface HallBooking {
  id: string;
  shift_id: string | null;
  hall_id: HallId;
  team_number: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  title: string;
  is_visible_in_schedule: boolean;
  created_by?: string | null;
  created_at?: string;
}
