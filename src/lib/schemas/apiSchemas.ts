import { z } from 'zod';

/* ---------- Shared Result pattern ---------- */

export interface ParseError {
  code: string;
  message: string;
}
export type Result<T, E = ParseError> = { ok: true; value: T } | { ok: false; error: E };

/** Runs a parser and converts any thrown exception into a typed failure. */
export function safeRun<T>(code: string, fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e: any) {
    return { ok: false, error: { code, message: e?.message || String(e) } };
  }
}

/* ---------- AI schedule responses ---------- */

const teamsField = z
  .array(z.union([z.number(), z.string()]))
  .optional()
  .nullable();

export const ScheduleAiItemSchema = z
  .object({
    time_start: z.string().nullable().optional(),
    time_end: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    target_teams: teamsField,
  })
  .passthrough();

export const ScheduleAiResponseSchema = z
  .object({
    items: z.array(ScheduleAiItemSchema),
    source: z.enum(['ai', 'groq_two_phase', 'fallback', 'local_fallback']).optional().catch('fallback'),
    reason: z.string().optional().nullable(),
    error: z.unknown().optional(),
  })
  .passthrough();
export type ScheduleAiResponse = z.infer<typeof ScheduleAiResponseSchema>;

/** Pasted AI Studio JSON: a day object, an array of days, or a wrapper with `days`. */
export const ScheduleJsonSchema = z.union([z.array(z.unknown()), z.record(z.unknown())]);

/* ---------- Fair QR payloads ---------- */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const optStr = z.string().nullable().optional().catch(null);
const optTeam = z.coerce.number().finite().nullable().optional().catch(null);

export const fairAmountSchema = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const FairQrPayloadSchema = (type: string, min: number, max: number) =>
  z.discriminatedUnion('is_reusable', [
    z.object({
      type: z.literal(type),
      is_reusable: z.literal(true),
      code_id: uuid,
      amount: fairAmountSchema(min, max),
      supervisor_id: optStr,
      supervisor_team: optTeam,
      supervisor_name: optStr,
      label: optStr,
    }),
    z.object({
      type: z.literal(type),
      is_reusable: z.literal(false),
      tx_id: uuid,
      amount: fairAmountSchema(min, max),
      timestamp: z.coerce.number().finite().positive(),
      supervisor_id: optStr,
      supervisor_team: optTeam,
      supervisor_name: optStr,
      code: z.string().optional().catch(''),
    }),
  ]);

/* ---------- Spreadsheet import rows ---------- */

export const ImportRowSchema = z
  .object({
    is_present: z.boolean(),
    row_number: z.number().int().nullable(),
    team_number: z.number().int().nonnegative(),
    full_name: z.string().trim().min(1),
    phone: z.string().nullable(),
    team_name: z.string().nullable(),
    note_from_table: z.string().nullable(),
    raw_data: z.record(z.any()),
    _issues: z.array(z.string()),
    _sourceRow: z.number(),
  })
  .passthrough();
