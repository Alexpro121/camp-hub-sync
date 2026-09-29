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
    // До 5 проходів по 200 учасників, поки є незаповнені.
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase.functions.invoke('detect-gender', { body: { action: 'backfill' } });
      if (error || !data?.updated) break;
    }
  } catch {
    /* тихо ігноруємо — стать можна виставити вручну */
  }
}
