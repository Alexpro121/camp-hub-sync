import { supabase } from '@/integrations/supabase/client';
import { ScheduleAiResponseSchema, type ScheduleAiResponse } from '@/lib/schemas/apiSchemas';

export interface ChunkParseResult {
  success: boolean;
  source: 'ai' | 'groq_two_phase' | 'fallback' | 'local_fallback';
  items: ScheduleAiResponse['items'];
  reason?: string;
  error?: unknown;
}

/** Ensures a valid access token before hitting the function (expired sessions caused 401s). */
async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  try { await supabase.auth.refreshSession(); } catch { /* stays anonymous → local fallback */ }
}

/** Single-call edge invocation. Never throws — always resolves to a result shape. */
async function callScheduleEdgeFunction(rawText: string, signal?: AbortSignal): Promise<ChunkParseResult> {
  try {
    if (signal?.aborted) return { success: false, source: 'fallback', items: [], reason: 'aborted' };
    await ensureSession();
    const res = await supabase.functions.invoke('parse-schedule-ai', { body: { rawText }, signal });
    if (signal?.aborted) return { success: false, source: 'fallback', items: [], reason: 'aborted' };
    const parsed = ScheduleAiResponseSchema.safeParse(res.data);
    if (!parsed.success && res.data && !res.error) {
      return { success: false, source: 'fallback', items: [], reason: 'invalid_ai_response', error: { message: parsed.error.issues[0]?.message } };
    }
    if (parsed.success) {
      const data = parsed.data;
      return {
        success: data.source === 'ai' && data.items.length > 0,
        source: data.source ?? 'fallback',
        items: data.items,
        reason: data.reason,
        error: data.error,
      };
    }
    return { success: false, source: 'fallback', items: [], reason: res.error ? 'invoke_error' : 'empty_result', error: res.error };
  } catch (e: unknown) {
    return { success: false, source: 'fallback', items: [], reason: 'client_exception', error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/** Compatibility entrypoint: preserve the entire date/team/subslot context in one request.
 * Arbitrary midpoint splitting silently lost half-days and team headers. */
export async function parseScheduleSmartTwoPhase(rawText: string, signal?: AbortSignal): Promise<ChunkParseResult> {
  if (!rawText?.trim()) return { success: false, source: 'fallback', items: [], reason: 'empty_input' };
  if (signal?.aborted) return { success: false, source: 'fallback', items: [], reason: 'aborted' };
  if (rawText.length > 25000) return { success: false, source: 'fallback', items: [], reason: 'input_too_large' };
  return callScheduleEdgeFunction(rawText, signal);
}
