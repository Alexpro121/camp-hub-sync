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
  shortName: string;
  badgeColor: string;
}

/** 
 * Список 8 фіксованих локацій Проєкту з адаптивними кольорами (Light / Dark) 
 */
export const HALLS_LIST: HallConfig[] = [
  { 
    id: 'hall_ab', 
    name: 'Зала AB', 
    shortName: 'AB',
    badgeColor: 'border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10' 
  },
  { 
    id: 'hall_cd', 
    name: 'Зала CD', 
    shortName: 'CD',
    badgeColor: 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10' 
  },
  { 
    id: 'grand_hall', 
    name: 'Велика зала', 
    shortName: 'Велика',
    badgeColor: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10' 
  },
  { 
    id: 'mirror_hall', 
    name: 'Дзеркальна зала', 
    shortName: 'Дзеркальна',
    badgeColor: 'border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10' 
  },
  { 
    id: 'brick_hall', 
    name: 'Цегляна зала', 
    shortName: 'Цегляна',
    badgeColor: 'border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/10' 
  },
  { 
    id: 'arena', 
    name: 'Манеж', 
    shortName: 'Манеж',
    badgeColor: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' 
  },
  { 
    id: 'pool', 
    name: 'Басейн', 
    shortName: 'Басейн',
    badgeColor: 'border-cyan-500/30 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10' 
  },
  { 
    id: 'boxing_hall', 
    name: 'Зал для боксу', 
    shortName: 'Бокс',
    badgeColor: 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10' 
  },
];

/** Словник для швидкого доступу O(1) */
export const HALLS_MAP: Record<HallId, HallConfig> = HALLS_LIST.reduce(
  (acc, hall) => {
    acc[hall.id] = hall;
    return acc;
  },
  {} as Record<HallId, HallConfig>
);

/** Перевірка валідності HallId (Type Guard) */
export const isHallId = (id: string): id is HallId =>
  HALLS_LIST.some((h) => h.id === id);

/** Отримання назви зали за її ID */
export const hallName = (id: string | null | undefined): string => {
  if (!id) return '';
  if (isHallId(id)) return HALLS_MAP[id]?.name || id;
  return id;
};

/** Отримання стилю бейджа зали */
export const hallBadge = (id: string | null | undefined): string => {
  if (id && isHallId(id)) return HALLS_MAP[id]?.badgeColor || 'border-border/50 text-muted-foreground bg-muted/30';
  return 'border-border/50 text-muted-foreground bg-muted/30';
};

/** Інтерфейс сутності бронювання зали в базі даних Supabase */
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
