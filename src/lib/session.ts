import type { Child } from '@/types/app';
import type { IronTx } from '@/components/fair/TransactionDetailsDialog';

export type AppRole = 'child' | 'supervisor' | 'admin';

const ROLE_KEY = 'helpsuprov:role';
const SESSION_META_KEY = 'helpsuprov:session-meta';
const CHILD_ARCHIVE_KEY = 'zz_child_persistent_passport_v1';

export interface SessionMeta {
  childId?: string | null;
  teamNumber?: number | null;
  supervisorId?: string | null;
  supervisorName?: string | null;
  shiftId?: string | null;
  phone?: string | null;
  loginAt?: string;
  roleTitle?: string;
  [key: string]: any;
}

export interface ChildArchiveData {
  child: Child;
  transactions: IronTx[];
  /** Розклад дня/зміни для офлайн-паспорта Учасника. */
  schedule?: unknown[];
  /** Місце в потязі (купе/місце), якщо відоме. */
  coupe?: { coupe_number?: number | null; seat?: string | null } | null;
  savedAt: string;
  isArchived: boolean;
  version?: number;
}

/* =========================================================================
   1. ОФЛАЙН-ПАСПОРТ УЧАСНИКА (Persistent Snapshot)
========================================================================= */

/** Зберігає повний зліпок профілю Учасника на пристрої (офлайн-паспорт) */
export const saveChildArchiveSnapshot = (
  child: Child,
  transactions: IronTx[] = [],
  extra?: { schedule?: unknown[]; coupe?: ChildArchiveData['coupe'] },
) => {
  if (typeof window === 'undefined') return;

  try {
    const payload: ChildArchiveData = {
      child,
      transactions: Array.isArray(transactions) ? transactions : [],
      schedule: extra?.schedule,
      coupe: extra?.coupe ?? null,
      savedAt: new Date().toISOString(),
      isArchived: true,
      version: 2,
    };

    localStorage.setItem(CHILD_ARCHIVE_KEY, JSON.stringify(payload));
  } catch (e: any) {
    // Якщо localStorage переповнено — зберігаємо без зайвого розкладу, зберігаючи критичні дані дитини
    console.warn('[Session] LocalStorage Quota warning, saving compact snapshot:', e);
    try {
      const compactPayload: ChildArchiveData = {
        child,
        transactions: transactions.slice(0, 30), // Останні 30 транзакцій
        coupe: extra?.coupe ?? null,
        savedAt: new Date().toISOString(),
        isArchived: true,
        version: 2,
      };
      localStorage.setItem(CHILD_ARCHIVE_KEY, JSON.stringify(compactPayload));
    } catch (criticalErr) {
      console.error('[Session] Не вдалося зберегти офлайн-паспорт:', criticalErr);
    }
  }
};

/** Отримує збережений паспорт Учасника */
export const getChildArchiveSnapshot = (): ChildArchiveData | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CHILD_ARCHIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.child || !parsed.child.id) return null;
    return parsed as ChildArchiveData;
  } catch {
    return null;
  }
};

/** Частково оновлює збережений зліпок паспорта (наприклад, баланс чи купе) */
export const updateChildArchiveSnapshot = (
  patch: Partial<Omit<ChildArchiveData, 'savedAt' | 'isArchived'>>,
) => {
  const current = getChildArchiveSnapshot();
  if (!current) return;

  saveChildArchiveSnapshot(
    patch.child ?? current.child,
    patch.transactions ?? current.transactions,
    {
      schedule: patch.schedule ?? current.schedule,
      coupe: patch.coupe ?? current.coupe,
    },
  );
};

/** Перевіряє наявність збереженого паспорта */
export const hasChildArchiveSnapshot = (): boolean => {
  return Boolean(getChildArchiveSnapshot());
};

/** Очищує лише збережений паспорт */
export const clearChildArchiveSnapshot = () => {
  try {
    localStorage.removeItem(CHILD_ARCHIVE_KEY);
  } catch {}
};

/* =========================================================================
   2. КЕРУВАННЯ СЕСІЄЮ ТА МЕТАДАНИМИ (Roles & Session Meta)
========================================================================= */

/** Зберігає або оновлює активну сесію та метадані */
export const saveSession = (role: AppRole, meta?: SessionMeta) => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(ROLE_KEY, role);

    if (meta) {
      const existingMeta = getSessionMeta() || {};
      const mergedMeta: SessionMeta = {
        ...existingMeta,
        ...meta,
        loginAt: meta.loginAt || new Date().toISOString(),
      };
      localStorage.setItem(SESSION_META_KEY, JSON.stringify(mergedMeta));
    }
  } catch (err) {
    console.warn('[Session] Failed to save session:', err);
  }
};

/** Оновлює окремі поля метаданих поточної сесії */
export const updateSessionMeta = (patch: Partial<SessionMeta>) => {
  if (typeof window === 'undefined') return;

  try {
    const current = getSessionMeta() || {};
    const updated: SessionMeta = { ...current, ...patch };
    localStorage.setItem(SESSION_META_KEY, JSON.stringify(updated));
  } catch {}
};

/** Отримує повний об'єкт метаданих сесії */
export const getSessionMeta = (): SessionMeta | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    return raw ? (JSON.parse(raw) as SessionMeta) : null;
  } catch {
    return null;
  }
};

/** Отримує активну роль користувача */
export const getSavedRole = (): AppRole | null => {
  if (typeof window === 'undefined') return null;

  try {
    const role = localStorage.getItem(ROLE_KEY);
    if (role === 'child' || role === 'supervisor' || role === 'admin') {
      return role as AppRole;
    }
    return null;
  } catch {
    return null;
  }
};

/** Отримує ID дитини з поточної сесії */
export const getSavedChildId = (): string | null => {
  const meta = getSessionMeta();
  return meta?.childId || null;
};

/** Отримує номер команди */
export const getSavedTeam = (): number | null => {
  const meta = getSessionMeta();
  return meta?.teamNumber ?? null;
};

/** Отримує ID поточної зміни */
export const getSavedShiftId = (): string | null => {
  const meta = getSessionMeta();
  return meta?.shiftId || null;
};

/** Отримує ID вожатого / куратора */
export const getSavedSupervisorId = (): string | null => {
  const meta = getSessionMeta();
  return meta?.supervisorId || null;
};

/* =========================================================================
   3. ПРЕДИКАТИ РОЛЕЙ ТА ОЧИЩЕННЯ
========================================================================= */

export const isChildSession = (): boolean => getSavedRole() === 'child';
export const isSupervisorSession = (): boolean => getSavedRole() === 'supervisor';
export const isAdminSession = (): boolean => getSavedRole() === 'admin';

/** Очищує активну сесію (роль та метадані) */
export const clearSavedSession = () => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(SESSION_META_KEY);
  } catch {}
};

/** Повне очищення всіх даних сесії та паспорта */
export const clearAllSessionData = (keepArchive = false) => {
  clearSavedSession();
  if (!keepArchive) {
    clearChildArchiveSnapshot();
  }
};
