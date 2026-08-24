import type { HallBooking, HallId } from '@/types/halls';

/** Сітка таймлайну залів: з 08:00 (480 хв) до 23:30 (1410 хв) */
export const TIMELINE_START = 8 * 60;
export const TIMELINE_END = 23 * 60 + 30;

/** Мінімальна та максимальна тривалість однієї броні */
export const MIN_BOOKING_MINUTES = 15;
export const MAX_BOOKING_MINUTES = 180; // максимум 3 години

/** 
 * Приводить час з будь-якого формату до канонічного HH:MM 
 * ("14:00:00", "9:30", "14.30" → "14:00", "09:30")
 */
export const hhmm = (value: string | null | undefined): string => {
  if (!value) return '';
  const str = String(value).trim();
  const match = str.match(/^(\d{1,2})[:.\-\s](\d{2})/);
  
  if (match) {
    const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Якщо передано лише годину (наприклад "14")
  const singleMatch = str.match(/^(\d{1,2})$/);
  if (singleMatch) {
    const h = Math.min(23, Math.max(0, parseInt(singleMatch[1], 10)));
    return `${String(h).padStart(2, '0')}:00`;
  }

  return '';
};

/** Перетворює рядок "HH:MM" у кількість хвилин від 00:00 */
export const toMinutes = (value: string | null | undefined): number => {
  const t = hhmm(value);
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Перетворює кількість хвилин від 00:00 у рядок "HH:MM" */
export const fromMinutes = (min: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Розрахунок та форматування тривалості ("1 год 30 хв", "45 хв") */
export const formatBookingDuration = (startTime: string, endTime: string): string => {
  const diff = toMinutes(endTime) - toMinutes(startTime);
  if (diff <= 0) return '0 хв';
  
  const h = Math.floor(diff / 60);
  const m = diff % 60;

  if (h === 0) return `${m} хв`;
  if (m === 0) return `${h} год`;
  return `${h} год ${m} хв`;
};

/** Перевірка перетину двох часових проміжків */
export const isTimeOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean => {
  const sA = toMinutes(startA);
  const eA = toMinutes(endA);
  const sB = toMinutes(startB);
  const eB = toMinutes(endB);
  return sA < eB && eA > sB;
};

/** 
 * Перевіряє, чи вільний обраний слот серед існуючих бронювань 
 */
export const checkSlotAvailability = (
  bookings: HallBooking[],
  hallId: HallId,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string,
): { available: boolean; conflictingBooking?: HallBooking } => {
  const conflict = bookings.find(
    (b) =>
      b.id !== excludeBookingId &&
      b.hall_id === hallId &&
      b.booking_date === date &&
      isTimeOverlap(b.start_time, b.end_time, startTime, endTime),
  );

  return { 
    available: !conflict, 
    conflictingBooking: conflict 
  };
};

/** Зрозуміле повідомлення про зайнятість зали іншою командою */
export const conflictMessage = (b: HallBooking): string =>
  `Зала вже зайнята Командою №${b.team_number} (${hhmm(b.start_time)}–${hhmm(b.end_time)})`;

/** Перевіряє, чи триває бронювання просто зараз */
export const isBookingActiveNow = (
  b: HallBooking, 
  currentDateIso: string, 
  now: Date = new Date()
): boolean => {
  if (b.booking_date !== currentDateIso) return false;
  const currentMin = now.getHours() * 60 + now.getMinutes();
  return currentMin >= toMinutes(b.start_time) && currentMin < toMinutes(b.end_time);
};

/** Генерація списку опцій часу з кроком 15/30 хв */
export const timeOptions = (
  step = 15, 
  from = TIMELINE_START, 
  to = TIMELINE_END
): string[] => {
  const out: string[] = [];
  for (let m = from; m <= to; m += step) {
    out.push(fromMinutes(m));
  }
  return out;
};

/** Повна валідація діапазону часу */
export const validateRange = (start: string, end: string): string | null => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  
  if (!start || !end) return 'Вкажіть час початку та завершення';
  if (e <= s) return 'Час завершення має бути пізнішим за початок';
  
  const duration = e - s;
  if (duration < MIN_BOOKING_MINUTES) {
    return `Мінімальна тривалість — ${MIN_BOOKING_MINUTES} хвилин`;
  }
  if (duration > MAX_BOOKING_MINUTES) {
    return `Максимальна тривалість однієї броні — ${Math.round(MAX_BOOKING_MINUTES / 60)} години`;
  }

  return null;
};
