import { supabase } from '@/integrations/supabase/client';

export interface ChunkParseResult {
  success: boolean;
  source: 'ai' | 'groq_two_phase' | 'fallback' | 'local_fallback';
  items: any[];
  reason?: string;
  error?: any;
}

/** Single-call edge invocation. Never throws — always resolves to a result shape. */
async function callScheduleEdgeFunction(rawText: string): Promise<ChunkParseResult> {
  try {
    const res = await supabase.functions.invoke('parse-schedule-ai', { body: { rawText } });
    const data: any = res.data;
    if (data && Array.isArray(data.items)) {
      return {
        success: data.source === 'ai' && data.items.length > 0,
        source: data.source ?? 'fallback',
        items: data.items,
        reason: data.reason,
        error: data.error,
      };
    }
    return { success: false, source: 'fallback', items: [], reason: res.error ? 'invoke_error' : 'empty_result', error: res.error };
  } catch (e: any) {
    return { success: false, source: 'fallback', items: [], reason: 'client_exception', error: { message: e?.message } };
  }
}

function sortAndDeduplicateItems(items: any[]) {
  const map = new Map<string, any>();
  for (const item of items) {
    const key = `${item?.time_start ?? ''}_${(item?.title ?? '').trim().toLowerCase()}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) => String(a?.time_start ?? '').localeCompare(String(b?.time_start ?? '')));
}

/** Splits long schedules at a logical midday boundary and parses both halves in parallel. */
export async function parseScheduleSmartTwoPhase(rawText: string): Promise<ChunkParseResult> {
  if (!rawText?.trim()) return { success: false, source: 'fallback', items: [], reason: 'empty_input' };

  if (rawText.length < 1000) return await callScheduleEdgeFunction(rawText);

  const lines = rawText.split(/\r?\n/);
  let midIndex = lines.findIndex((line) => /обід|15[:.]00|14[:.]30/i.test(line));
  if (midIndex <= 0 || midIndex >= lines.length - 2) midIndex = Math.floor(lines.length / 2);

  const textPhase1 = lines.slice(0, midIndex).join('\n');
  const textPhase2 = lines.slice(midIndex).join('\n');

  const [res1, res2] = await Promise.all([
    callScheduleEdgeFunction(textPhase1),
    callScheduleEdgeFunction(textPhase2),
  ]);

  const combined = [...(res1.items ?? []), ...(res2.items ?? [])];
  if (combined.length === 0) {
    return { success: false, source: 'fallback', items: [], reason: res1.reason ?? res2.reason ?? 'empty_result', error: res1.error ?? res2.error };
  }

  return { success: true, source: 'groq_two_phase', items: sortAndDeduplicateItems(combined) };
}
