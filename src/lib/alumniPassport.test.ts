import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAlumniPassport, clearAlumniPassport, loadAlumniPassport, migratePassport, saveAlumniPassport, verifyChecksum } from './alumniPassport';

beforeEach(async () => { localStorage.clear(); await clearAlumniPassport(); });
describe('passport validation', () => {
  it('rejects changed balance rather than repairing its checksum', async () => {
    const p = buildAlumniPassport({ full_name: 'Марія Коваль', team_number: 3, iron_dollars: 247 });
    const changed = { ...p, child_profile: { ...p.child_profile, iron_dollars: 999 } };
    localStorage.setItem('iron_alumni_passport_v4', JSON.stringify(changed));
    expect(await loadAlumniPassport()).toBeNull();
    await expect(saveAlumniPassport(changed)).rejects.toThrow();
  });
  it('rejects incomplete current passports without crashing', async () => {
    localStorage.setItem('iron_alumni_passport_v4', JSON.stringify({ _schema_version: '4.0.2026', child_profile: { full_name: 'Марія' } }));
    expect(await loadAlumniPassport()).toBeNull();
  });
  it('retains child identity during snapshot migration', () => {
    const p = migratePassport({ child: { id: 'child-2', full_name: 'Марія Коваль', team_number: 3, iron_dollars: 247 }, savedAt: '2026-08-20T10:00:00Z' });
    expect(p?.child_profile.child_id).toBe('child-2');
    expect(p && verifyChecksum(p)).toBe(true);
  });
});