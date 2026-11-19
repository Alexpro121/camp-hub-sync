import { supabase } from '@/integrations/supabase/client';
import { getTg } from '@/hooks/useTelegramWebApp';
import { clearSavedSession, getSavedRole, saveSession } from '@/lib/session';

/**
 * Вхід у Telegram Mini App. Хто користувач (дитина, супровід, адмін) вирішує сервер
 * за підписаним Telegram initData; клієнт не обирає роль і не показує форм входу.
 */

export type TelegramBlockState = 'unlinked' | 'pending' | 'revoked' | 'error';

export type TelegramAuthResult =
  | { state: 'ok'; role: 'child'; childId: string; teamNumber: number | null; shiftId: string | null }
  | { state: 'ok'; role: 'staff' | 'admin'; kind: string; fullName: string }
  | { state: Exclude<TelegramBlockState, 'error'> }
  | { state: 'error'; offline: boolean };

/** Підписані дані запуску; порожні поза Telegram або при запуску без initData. */
export const getTelegramInitData = (): string => {
  const data = getTg()?.initData;
  return typeof data === 'string' ? data : '';
};

/** Застосунок відкрито всередині Telegram з даними для входу. */
export const isTelegramMiniApp = (): boolean => getTelegramInitData().length > 0;

export const closeMiniApp = () => {
  try { getTg()?.close(); } catch { /* поза Telegram */ }
};

interface TgAuthResponse {
  state: string;
  role?: string;
  childId?: string;
  teamNumber?: number | null;
  shiftId?: string | null;
  kind?: string;
  fullName?: string;
  session?: { access_token?: string; refresh_token?: string };
}

let pending: Promise<TelegramAuthResult> | null = null;

/** Один вхід на відкриття застосунку: головна сторінка і кабінет супроводу ділять результат. */
export function telegramSignIn(): Promise<TelegramAuthResult> {
  if (!pending) {
    pending = signIn().then((result) => {
      if (result.state === 'error') pending = null;
      return result;
    });
  }
  return pending;
}

async function signIn(): Promise<TelegramAuthResult> {
  const initData = getTelegramInitData();
  if (!initData) return { state: 'unlinked' };

  const { data, error }: { data: TgAuthResponse | null; error: unknown } = await supabase.functions
    .invoke<TgAuthResponse>('tg-auth', { body: { initData } })
    .catch((e: unknown) => ({ data: null, error: e }));
  if (error || !data) {
    const status = (error as { context?: { status?: number } } | null)?.context?.status ?? 0;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return { state: 'error', offline: offline || status === 0 };
  }

  if (data.state === 'ok' && data.session?.access_token && data.session?.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (sessionError) return { state: 'error', offline: false };

    if (data.role === 'child') {
      if (!data.childId) return { state: 'error', offline: false };
      saveSession('child', { childId: data.childId, teamNumber: data.teamNumber ?? null, shiftId: data.shiftId ?? null });
      return { state: 'ok', role: 'child', childId: data.childId, teamNumber: data.teamNumber ?? null, shiftId: data.shiftId ?? null };
    }
    if (data.role === 'admin') saveSession('admin');
    // Супровід відновлює кабінет із сесії; збережена роль дитини з цього пристрою не повинна заважати.
    else if (getSavedRole() === 'child') clearSavedSession();
    return { state: 'ok', role: data.role === 'admin' ? 'admin' : 'staff', kind: String(data.kind ?? ''), fullName: String(data.fullName ?? '') };
  }

  // Неприв'язаний акаунт: прибираємо будь-яку попередню сесію з цього пристрою.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  clearSavedSession();
  const state = data.state === 'pending' || data.state === 'revoked' ? data.state : 'unlinked';
  return { state };
}

/** Виклик дії Mini App (функція tg-app). Кожен запит підписаний initData; права перевіряє сервер. */
export async function tgApp<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions
    .invoke<T>('tg-app', { body: { ...body, action, initData: getTelegramInitData() } })
    .catch((e: unknown) => ({ data: null, error: e }));
  if (error || !data) throw new Error('tg_app_failed');
  return data;
}

/** Код реєстрації працівника: з посилання бота (?reg=) або з start_param прямого посилання на Mini App. */
export function registrationCode(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('reg');
    if (fromUrl && /^[A-Za-z0-9_-]{1,64}$/.test(fromUrl)) return fromUrl;
  } catch { /* поза браузером */ }
  const start = getTg()?.initDataUnsafe?.start_param;
  return typeof start === 'string' && start.startsWith('reg_') ? start : null;
}
