/**
 * Хто бачить розклад: один розклад може належати кільком паралельним змінам.
 * Номери команд у таборі наскрізні (у кожної зміни свої), тож після вибору
 * розкладу за зміною достатньо фільтра за номером команди.
 */
export interface ScheduleScope {
  shift_id: string | null;
  shift_ids?: string[] | null;
}

/** Зміни розкладу; null — загальнотаборовий (для всіх змін). */
export function audienceOf(s: ScheduleScope): string[] | null {
  if (s.shift_ids?.length) return [...new Set(s.shift_ids)].sort();
  return s.shift_id ? [s.shift_id] : null;
}

/** Чи бачить розклад учасник/супровід конкретної зміни (без зміни — бачить усе). */
export function visibleToShift(s: ScheduleScope, shiftId: string | null | undefined): boolean {
  const aud = audienceOf(s);
  return !shiftId || aud === null || aud.includes(shiftId);
}

/** Чи стосується розклад хоча б однієї з обраних змін. */
export function touchesShifts(s: ScheduleScope, shiftIds: string[]): boolean {
  const aud = audienceOf(s);
  return aud === null || !shiftIds.length || aud.some((id) => shiftIds.includes(id));
}

export function sameAudience(s: ScheduleScope, shiftIds: string[]): boolean {
  const aud = audienceOf(s);
  const want = [...new Set(shiftIds)].sort();
  if (aud === null) return want.length === 0;
  return aud.length === want.length && aud.every((id, i) => id === want[i]);
}

/** Поля для запису в schedules: shift_id лишається для старих клієнтів, коли зміна одна. */
export function audiencePayload(shiftIds: string[]): { shift_id: string | null; shift_ids: string[] | null } {
  const ids = [...new Set(shiftIds)].sort();
  return { shift_id: ids.length === 1 ? ids[0] : null, shift_ids: ids.length ? ids : null };
}
