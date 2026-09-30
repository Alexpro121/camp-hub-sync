import { supabase } from '@/integrations/supabase/client';

export type StaffKind = 'supervisor' | 'duckling';
export const KIND_LABEL: Record<StaffKind, string> = { supervisor: 'Супровід', duckling: 'Каченя' };

export async function staffCall<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('staff-accounts', { body }).catch((e) => ({ data: null as any, error: e }));
  if (error || data?.error) throw new Error(data?.error || 'failed');
  return data as T;
}

export const STAFF_ERR: Record<string, string> = {
  login_taken: 'Такий логін уже зайнятий',
  invalid_input: 'Перевірте поля',
  weak_password: 'Пароль занадто простий. Мінімум 8 символів, не "12345678" чи "password"',
  bad_name: 'Вкажіть прізвище та імʼя',
  bad_phone: 'Невірний номер телефону',
  bad_telegram: 'Telegram: 4-32 символи, латиниця, цифри, _',
  bad_login: 'Логін: латиниця, цифри, . _ - (3-40 символів)',
  invite_invalid: 'Посилання недійсне, вичерпане або прострочене',
  invite_busy: 'Спробуйте ще раз',
  need_limit: 'Вкажіть кількість реєстрацій або термін дії',
  bad_avatar: 'Не вдалося зберегти фото',
  too_many_attempts: 'Забагато спроб. Зачекайте хвилину',
};
export const staffErr = (e: unknown) => STAFF_ERR[(e as Error)?.message] ?? 'Щось пішло не так';

/** Стискає фото до квадрата 256px (~15-40 КБ) для аватарки. */
export async function compressAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(256, side);
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      let out = c.toDataURL('image/webp', q);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q);
      if (out.length <= 85000) return out;
    }
    throw new Error('too_big');
  } finally { URL.revokeObjectURL(url); }
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
