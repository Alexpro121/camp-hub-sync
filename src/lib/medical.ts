import { z } from 'zod';

export const MedicalDraftSchema = z.object({ child_id: z.string().uuid(), note: z.string().max(4000), needs_attention: z.boolean(), version: z.number().int().nonnegative() });
export interface MedicalNote { child_id: string; note: string; needs_attention: boolean; version: number; updated_at: string }
export interface MedicalAssignment { shift_id: string; team_number: number; staff_members: { full_name: string; kind: string; is_active: boolean } | null }
export function supervisorsForChild(assignments: MedicalAssignment[], shiftId: string | null, team: number): string[] {
  return [...new Set(assignments.filter((a) => a.shift_id === shiftId && a.team_number === team && a.staff_members?.is_active && ['supervisor', 'duckling'].includes(a.staff_members.kind)).map((a) => a.staff_members?.full_name ?? ''))];
}