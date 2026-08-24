import type { HallBooking, HallId } from '@/types/halls';

/** Приводить час до канонічного HH:MM ("14.5" / "14:00:00" → "14:00") */
export const hhmm = (value: string | null | undefined): string => {
  if (!value) return '';
  const m = String(value).trim().match(/^(\d{1,2})[.:\-\s]?(\d{2})?/);
  if (!m) return '';
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2] ?? '0', 10));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

export const toMinutes = (value: string): number => {
  const t = hhmm(value);
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

/** Перевірка перетину двох часових проміжків */
export const isTimeOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean => toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);

/** Перевірка, чи вільний слот серед існуючих бронювань */
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

  return { available: !conflict, conflictingBooking: conflict };
};

export const conflictMessage = (b: HallBooking): string =>
  `Зала вже зайнята Командою №${b.team_number} з ${hhmm(b.start_time)} по ${hhmm(b.end_time)}`;

/** Сітка таймлайну зали */
export const TIMELINE_START = 8 * 60;
export const TIMELINE_END = 23 * 60;

/** Варіанти часу з кроком 15 хв у межах сітки */
export const timeOptions = (step = 15, from = TIMELINE_START, to = TIMELINE_END): string[] => {
  const out: string[] = [];
  for (let m = from; m <= to; m += step) out.push(fromMinutes(m));
  return out;
};

export const validateRange = (start: string, end: string): string | null => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (!start || !end) return 'Вкажіть час початку та завершення';
  if (e <= s) return 'Час завершення має бути пізніше за початок';
  if (e - s < 15) return 'Мінімальна тривалість — 15 хвилин';
  return null;
};
