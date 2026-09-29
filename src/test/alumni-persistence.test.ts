import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveChildArchiveSnapshot, getChildArchiveSnapshot, updateChildArchiveSnapshot,
  saveSession, clearSavedSession, clearAllSessionData,
} from '@/lib/session';
import {
  buildAlumniPassport, saveAlumniPassport, loadAlumniPassport, clearAlumniPassport,
  verifyChecksum, migratePassport,
} from '@/lib/alumniPassport';
import type { Child } from '@/types/app';

const NAMES = [
  "Мар'яна Коваль-Шевченко",
  'Олег Ігорович Приймак',
  'Ярослава Ґудзь',
  'Їжакевич Євгенія Олексіївна',
  'Софія',
  'Дмитро  Бойко ', // подвійний пробіл + хвостовий
  'Анна-Марія Ковальчук',
  'Назарʼї Щербак', // типографський апостроф
];

const mk = (full_name: string, i: number, extra: Partial<Child> = {}): Child => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  shift_id: 'shift-summer-2026',
  row_number: i,
  team_number: (i % 12) + 1,
  full_name,
  phone: null,
  team_name: null,
  note_from_table: null,
  is_present: true,
  has_logged_in: true,
  iron_dollars: 100 + i * 7,
  telegram_username: null,
  supervisor_notes: null,
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  raw_data: null,
  ...extra,
} as Child);

beforeEach(async () => {
  localStorage.clear();
  await clearAlumniPassport();
});

describe('Збереження профілю після зміни — реальні ПІБ', () => {
  it.each(NAMES.map((n, i) => [n, i]))('знімок «%s» зберігається 1-в-1', (name, i) => {
    const child = mk(name as string, i as number);
    saveChildArchiveSnapshot(child, []);
    const snap = getChildArchiveSnapshot();
    expect(snap?.child.full_name).toBe(name);
    expect(snap?.child.iron_dollars).toBe(child.iron_dollars);
    expect(snap?.child.team_number).toBe(child.team_number);
  });

  it.each(NAMES.map((n, i) => [n, i]))('паспорт випускника «%s»: IndexedDB + checksum', async (name, i) => {
    const child = mk(name as string, i as number);
    const p = buildAlumniPassport({ ...child, shift_id: child.shift_id });
    expect(verifyChecksum(p)).toBe(true);
    await saveAlumniPassport(p);
    const loaded = await loadAlumniPassport();
    expect(loaded?.child_profile.full_name).toBe(name);
    expect(loaded?.child_profile.iron_dollars).toBe(child.iron_dollars);
    expect(loaded && verifyChecksum(loaded)).toBe(true);
  });

  it('знімок переживає вихід із сесії (кінець зміни)', () => {
    const c = mk(NAMES[0], 1);
    saveSession('child', { childId: c.id, teamNumber: c.team_number });
    saveChildArchiveSnapshot(c, []);
    clearSavedSession();
    expect(getChildArchiveSnapshot()?.child.full_name).toBe(NAMES[0]);
    clearAllSessionData(true);
    expect(getChildArchiveSnapshot()).not.toBeNull();
  });

  it('оновлення балансу зберігає транзакції', () => {
    const c = mk(NAMES[1], 2);
    saveChildArchiveSnapshot(c, [{ id: 't1', amount_change: 50 } as any]);
    updateChildArchiveSnapshot({ child: { ...c, iron_dollars: 999 } });
    const s = getChildArchiveSnapshot()!;
    expect(s.child.iron_dollars).toBe(999);
    expect(s.transactions).toHaveLength(1);
  });

  it('підробка балансу виявляється checksum', async () => {
    const p = buildAlumniPassport({ full_name: NAMES[2], team_number: 3, iron_dollars: 40 });
    expect(verifyChecksum({ ...p, child_profile: { ...p.child_profile, iron_dollars: 99999 } })).toBe(false);
  });

  it('пошкоджений localStorage не ламає читання', async () => {
    localStorage.setItem('zz_child_persistent_passport_v1', '{bad json');
    expect(getChildArchiveSnapshot()).toBeNull();
    localStorage.setItem('iron_alumni_passport_v4', 'null');
    expect(await loadAlumniPassport()).toBeNull();
  });

  it('міграція зі знімка учасника в паспорт', () => {
    const c = mk(NAMES[3], 4);
    const m = migratePassport({ child: c, savedAt: '2026-08-20T10:00:00Z' });
    expect(m?.child_profile.full_name).toBe(NAMES[3]);
    expect(m?.child_profile.year).toBe(2026);
    expect(m && verifyChecksum(m)).toBe(true);
  });

  it('переповнена квота — зберігається компактний знімок', () => {
    const c = mk(NAMES[6], 6);
    const orig = Storage.prototype.setItem;
    let n = 0;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'zz_child_persistent_passport_v1' && n++ === 0) throw new DOMException('quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
    try {
      const txs = Array.from({ length: 80 }, (_, i) => ({ id: `t${i}` })) as any;
      saveChildArchiveSnapshot(c, txs, { schedule: [1, 2, 3] });
    } finally { Storage.prototype.setItem = orig; }
    const s = getChildArchiveSnapshot()!;
    expect(s.child.full_name).toBe(NAMES[6]);
    expect(s.transactions).toHaveLength(30);
  });
});
