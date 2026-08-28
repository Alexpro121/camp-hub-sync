/**
 * IRON ALUMNI ENGINE — офлайн-паспорт випускника проєкту «Залізна Зміна».
 *
 * Архітектура Zero-Server-Storage: усі дані паспорта живуть ВИКЛЮЧНО на пристрої
 * (IndexedDB + дзеркало в localStorage). У базі даних не створюється жодного рядка.
 */

export const ALUMNI_SCHEMA_VERSION = '4.0.2026' as const;

const DB_NAME = 'iron-alumni';
const DB_STORE = 'passport';
const DB_KEY = 'current';
const LS_MIRROR_KEY = 'iron_alumni_passport_v4';

export interface AlumniChildProfile {
  full_name: string;
  team_number: number;
  iron_dollars: number;
  avatar_id: number;
  shift_id: string;
  shift_name: string;
  year: number;
  status: 'alumni';
}

export interface AlumniPassportEnvelope {
  _schema_version: typeof ALUMNI_SCHEMA_VERSION;
  passport_id: string;
  created_at: string;
  checksum: string;
  child_profile: AlumniChildProfile;
  achievements: string[];
  certificate_ready: boolean;
}

/* =========================================================================
   1. ХЕШ ВАЛІДНОСТІ (FNV-1a 32-bit)
========================================================================= */

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Формує канонічний рядок паспорта (без самого поля checksum) */
function canonical(envelope: Omit<AlumniPassportEnvelope, 'checksum'>): string {
  const p = envelope.child_profile;
  return [
    envelope._schema_version,
    envelope.passport_id,
    envelope.created_at,
    p.full_name,
    p.team_number,
    p.iron_dollars,
    p.avatar_id,
    p.shift_id,
    p.shift_name,
    p.year,
    p.status,
    envelope.achievements.join('|'),
    envelope.certificate_ready ? '1' : '0',
  ].join('::');
}

export function computeChecksum(envelope: Omit<AlumniPassportEnvelope, 'checksum'>): string {
  return fnv1a(canonical(envelope));
}

export function verifyChecksum(envelope: AlumniPassportEnvelope): boolean {
  const { checksum, ...rest } = envelope;
  return computeChecksum(rest) === checksum;
}

/* =========================================================================
   2. СТВОРЕННЯ ТА МІГРАЦІЯ
========================================================================= */

export interface BuildPassportInput {
  full_name: string;
  team_number: number;
  iron_dollars: number;
  avatar_id?: number;
  shift_id?: string | null;
  shift_name?: string | null;
  year?: number;
  achievements?: string[];
  certificate_ready?: boolean;
  passport_id?: string;
  created_at?: string;
}

const newId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

export function buildAlumniPassport(input: BuildPassportInput): AlumniPassportEnvelope {
  const base: Omit<AlumniPassportEnvelope, 'checksum'> = {
    _schema_version: ALUMNI_SCHEMA_VERSION,
    passport_id: input.passport_id || newId(),
    created_at: input.created_at || new Date().toISOString(),
    child_profile: {
      full_name: input.full_name,
      team_number: Number(input.team_number) || 0,
      iron_dollars: Number(input.iron_dollars) || 0,
      avatar_id: Number(input.avatar_id ?? Number(fnv1a(input.full_name).slice(0, 4), 16) % 32),
      shift_id: input.shift_id || '',
      shift_name: input.shift_name || 'Зміна проєкту «Залізна Зміна»',
      year: input.year || new Date().getFullYear(),
      status: 'alumni',
    },
    achievements: input.achievements ?? [],
    certificate_ready: input.certificate_ready ?? true,
  };
  return { ...base, checksum: computeChecksum(base) };
}

/**
 * Міграція паспортів попередніх схем на актуальну версію.
 * Повертає null, якщо об'єкт неможливо розпізнати як паспорт.
 */
export function migratePassport(raw: unknown): AlumniPassportEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, any>;

  // Формат-джерело: офлайн-знімок Учасника ({ child: {...} })
  if (!obj.child_profile && obj.child && typeof obj.child === 'object') {
    return buildAlumniPassport({
      full_name: obj.child.full_name,
      team_number: obj.child.team_number,
      iron_dollars: obj.child.iron_dollars,
      shift_id: obj.child.shift_id,
      year: new Date(obj.savedAt || Date.now()).getFullYear(),
    });
  }

  if (!obj.child_profile || typeof obj.child_profile !== 'object') return null;

  const profile = obj.child_profile as Record<string, any>;
  const migrated = buildAlumniPassport({
    full_name: String(profile.full_name || 'Випускник проєкту'),
    team_number: Number(profile.team_number) || 0,
    iron_dollars: Number(profile.iron_dollars) || 0,
    avatar_id: profile.avatar_id,
    shift_id: profile.shift_id,
    shift_name: profile.shift_name,
    year: Number(profile.year) || new Date().getFullYear(),
    achievements: Array.isArray(obj.achievements) ? obj.achievements.map(String) : [],
    certificate_ready: obj.certificate_ready !== false,
    passport_id: typeof obj.passport_id === 'string' ? obj.passport_id : undefined,
    created_at: typeof obj.created_at === 'string' ? obj.created_at : undefined,
  });

  return migrated;
}

/* =========================================================================
   3. IndexedDB СХОВИЩЕ + ДЗЕРКАЛО В localStorage
========================================================================= */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступна'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAlumniPassport(envelope: AlumniPassportEnvelope): Promise<void> {
  const safe: AlumniPassportEnvelope = verifyChecksum(envelope)
    ? envelope
    : { ...envelope, checksum: computeChecksum(envelope) };

  try {
    localStorage.setItem(LS_MIRROR_KEY, JSON.stringify(safe));
  } catch {
    // Приватний режим браузера — покладаємось на IndexedDB
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(safe, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('[AlumniPassport] IndexedDB недоступна, збережено лише локальне дзеркало', e);
  }
}

export async function loadAlumniPassport(): Promise<AlumniPassportEnvelope | null> {
  let raw: unknown = null;

  try {
    const db = await openDb();
    raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    raw = null;
  }

  if (!raw) {
    try {
      const mirror = localStorage.getItem(LS_MIRROR_KEY);
      raw = mirror ? JSON.parse(mirror) : null;
    } catch {
      raw = null;
    }
  }

  if (!raw) return null;

  const obj = raw as Record<string, any>;
  if (obj._schema_version === ALUMNI_SCHEMA_VERSION && verifyChecksum(obj as AlumniPassportEnvelope)) {
    return obj as AlumniPassportEnvelope;
  }

  const migrated = migratePassport(obj);
  if (migrated) await saveAlumniPassport(migrated);
  return migrated;
}

/** Синхронна перевірка наявності паспорта (для швидкого рендеру кнопок) */
export function hasLocalAlumniPassport(): boolean {
  try {
    return Boolean(localStorage.getItem(LS_MIRROR_KEY));
  } catch {
    return false;
  }
}

export async function clearAlumniPassport(): Promise<void> {
  try {
    localStorage.removeItem(LS_MIRROR_KEY);
  } catch {
    // ігноруємо
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // ігноруємо
  }
}
