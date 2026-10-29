import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { scheduleImportKey, type ImportDay } from './scheduleImport';

/** New batches never reuse published rows; failed batches are removed before retry. */
export async function saveScheduleImport(days: ImportDay[], shiftId: string | null, rawText: string) {
  let total = 0;
  let skipped = 0;
  const created: string[] = [];
  try {
    for (const day of days) {
      let query = supabase.from('schedules').select('id').eq('date', day.date).is('deleted_at', null);
      query = shiftId ? query.eq('shift_id', shiftId) : query.is('shift_id', null);
      const schedules = await query;
      if (schedules.error) throw schedules.error;
      const ids = (schedules.data ?? []).map((row) => row.id);
      const seen = new Set<string>();
      // Stable pagination: a long existing day must not silently truncate deduplication.
      if (ids.length) {
        for (let from = 0; ; from += 500) {
          const existing = await supabase.from('schedule_items').select('id,title,time_start,location,target_teams')
            .in('schedule_id', ids).order('id').range(from, from + 499);
          if (existing.error) throw existing.error;
          (existing.data ?? []).forEach((item) => seen.add(scheduleImportKey(item)));
          if ((existing.data ?? []).length < 500) break;
        }
      }
      const items = day.items.filter((item) => {
        const key = scheduleImportKey(item);
        if (seen.has(key)) { skipped++; return false; }
        seen.add(key); return true;
      });
      if (!items.length) continue;
      const batch = await supabase.from('schedules').insert({ date: day.date, shift_id: shiftId, raw_text: rawText.trim() || null, is_published: false }).select('id').single();
      if (batch.error) throw batch.error;
      if (!batch.data) throw new Error('Не вдалося створити чернетку');
      const id = batch.data.id;
      created.push(id);
      const rows: Database['public']['Tables']['schedule_items']['Insert'][] = items.map((item, index) => ({ ...item, schedule_id: id, order_index: index }));
      for (let offset = 0; offset < rows.length; offset += 200) {
        const saved = await supabase.from('schedule_items').insert(rows.slice(offset, offset + 200));
        if (saved.error) throw saved.error;
      }
      total += rows.length;
    }
    return { total, skipped };
  } catch (error) {
    if (created.length) {
      const items = await supabase.from('schedule_items').delete().in('schedule_id', created);
      const batches = items.error ? null : await supabase.from('schedules').delete().in('id', created);
      if (items.error || batches?.error) throw new Error('Імпорт перервався; частина чернетки залишилася. Перевірте редактор дня перед повтором.');
    }
    throw error;
  }
}