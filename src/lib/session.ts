import type { Child, IronTransaction } from '@/types/app';

// Persistent role/session metadata so the app can auto-open the right cabinet.

export type SavedRole = 'child' | 'supervisor' | 'admin';

const ROLE_KEY = 'camphub_saved_role';
const CHILD_KEY = 'camphub_child_id';
const TEAM_KEY = 'camphub_team_number';

const cloud = () => (window as any)?.Telegram?.WebApp?.CloudStorage ?? null;

export const saveSession = (role: SavedRole, opts?: { childId?: string; teamNumber?: number | null }) => {
  try {
    localStorage.setItem(ROLE_KEY, role);
    if (opts?.childId) localStorage.setItem(CHILD_KEY, opts.childId);
    if (opts?.teamNumber != null) localStorage.setItem(TEAM_KEY, String(opts.teamNumber));
    cloud()?.setItem?.(ROLE_KEY, role);
  } catch { /* storage unavailable */ }
};

export const getSavedRole = (): SavedRole | null => {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return r === 'child' || r === 'supervisor' || r === 'admin' ? r : null;
  } catch { return null; }
};

export const getSavedChildId = () => {
  try { return localStorage.getItem(CHILD_KEY); } catch { return null; }
};

export const getSavedTeam = (): number | null => {
  try {
    const t = localStorage.getItem(TEAM_KEY);
    const n = t ? parseInt(t, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
};

export const clearSavedSession = () => {
  try {
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(CHILD_KEY);
    localStorage.removeItem(TEAM_KEY);
    cloud()?.removeItem?.(ROLE_KEY);
  } catch { /* storage unavailable */ }
};
