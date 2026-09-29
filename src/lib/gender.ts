import { supabase } from '@/integrations/supabase/client';

export type Gender = 'boy' | 'girl' | 'unknown';

export const GENDER_LABEL: Record<Gender, string> = {
  boy: 'Хлопець 👦',
  girl: 'Дівчина 👧',
  unknown: 'Не визначено',
};

/** Фонове визначення статі для учасників без заповненого поля. Ніколи не кидає помилку. */
export async function backfillGenders(): Promise<void> {
  try {
    await supabase.functions.invoke('detect-gender', { body: { action: 'backfill' } });
  } catch {
    /* тихо ігноруємо — стать можна виставити вручну */
  }
}
