import { z } from 'npm:zod@3';

export const DoctorSaveSchema = z.object({ child_id: z.string().uuid(), note: z.string().max(4000), needs_attention: z.boolean(), version: z.number().int().nonnegative() }).strict();
export function canUseDoctorActions(member: { kind: string; is_active: boolean } | null) {
  return member?.kind === 'doctor' && member.is_active === true;
}
/** PostgREST caps each response; range through every page, never silently truncate. */
export async function readAllPages<T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await read(start, start + 499);
    if (error) throw new Error('load_failed');
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}