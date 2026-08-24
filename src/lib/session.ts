import type { Child } from '@/types/app';
import type { IronTx } from '@/components/fair/TransactionDetailsDialog';

const ROLE_KEY = 'helpsuprov:role';
const SESSION_META_KEY = 'helpsuprov:session-meta';
const CHILD_ARCHIVE_KEY = 'zz_child_persistent_passport_v1';

export interface ChildArchiveData {
  child: Child;
  transactions: IronTx[];
  savedAt: string;
  isArchived: boolean;
}

/** Зберігає повний зліпок профілю дитини на пристрої */
export const saveChildArchiveSnapshot = (child: Child, transactions: IronTx[] = []) => {
  try {
    const payload: ChildArchiveData = {
      child,
      transactions,
      savedAt: new Date().toISOString(),
      isArchived: true,
    };
    localStorage.setItem(CHILD_ARCHIVE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error('[Session] Не вдалося зберегти офлайн-паспорт:', e);
  }
};

/** Отримує збережений табірний паспорт дитини */
export const getChildArchiveSnapshot = (): ChildArchiveData | null => {
  try {
    const raw = localStorage.getItem(CHILD_ARCHIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSession = (role: 'child' | 'supervisor' | 'admin', meta?: Record<string, any>) => {
  try {
    localStorage.setItem(ROLE_KEY, role);
    if (meta) localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
  } catch {}
};

export const getSavedRole = (): 'child' | 'supervisor' | 'admin' | null => {
  try {
    return (localStorage.getItem(ROLE_KEY) as any) || null;
  } catch {
    return null;
  }
};

export const getSavedChildId = (): string | null => {
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.childId || null;
  } catch {
    return null;
  }
};

export const getSavedTeam = (): number | null => {
  try {
    const raw = localStorage.getItem(SESSION_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.teamNumber ?? null;
  } catch {
    return null;
  }
};

export const clearSavedSession = () => {
  try {
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(SESSION_META_KEY);
  } catch {}
};
