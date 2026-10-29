import { canUseDoctorActions, DoctorSaveSchema, readAllPages } from './doctor-contract.ts';
const assert = (value: boolean) => { if (!value) throw new Error('Assertion failed'); };
Deno.test('only active doctor can use doctor actions', () => {
  assert(canUseDoctorActions({ kind: 'doctor', is_active: true }));
  assert(!canUseDoctorActions({ kind: 'doctor', is_active: false }));
  assert(!canUseDoctorActions({ kind: 'supervisor', is_active: true }));
  assert(!canUseDoctorActions(null));
});
Deno.test('medical updates reject presence changes', () => {
  const value = { child_id: '11111111-1111-4111-8111-111111111111', note: '', needs_attention: false, version: 0 };
  assert(DoctorSaveSchema.safeParse(value).success);
  assert(!DoctorSaveSchema.safeParse({ ...value, is_present: true }).success);
});
Deno.test('all children returned beyond the default thousand-row cap', async () => {
  const data = Array.from({ length: 1305 }, (_, id) => ({ id }));
  const result = await readAllPages(async (start, end) => ({ data: data.slice(start, end + 1), error: null }));
  assert(result.length === 1305 && result[1304].id === 1304);
});