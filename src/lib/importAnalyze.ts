import { supabase } from '@/integrations/supabase/client';
import {
  buildRows, detectHeaderIndex, localHeaderMap, matrixFromCsv, matrixFromFile,
  type ImportResult, type StdKey,
} from '@/lib/importer';

/** Ask Groq to map messy headers; silently falls back to the local dictionary. */
async function aiHeaderMap(headers: string[], samples: any[][]): Promise<Record<string, StdKey> | null> {
  try {
    const { data, error } = await supabase.functions.invoke('import-table', {
      body: { action: 'map_headers', headers, samples },
    });
    if (error) return null;
    const map = (data as any)?.header_map as Record<string, StdKey> | undefined;
    if (!map || Object.keys(map).length === 0) return null;
    return map;
  } catch {
    return null;
  }
}

export async function analyzeMatrix(matrix: any[][]): Promise<ImportResult> {
  if (!matrix.length) return { rows: [], headers: [], headerMap: {}, mapSource: 'local', skipped: 0 };
  const headerIdx = detectHeaderIndex(matrix);
  const headers = (matrix[headerIdx] || []).map((h: any) => String(h ?? '').trim()).filter(Boolean);
  const local = localHeaderMap(headers);

  let headerMap = local;
  let mapSource: 'ai' | 'local' = 'local';

  const needsAI = !Object.values(local).includes('full_name') || !Object.values(local).includes('team_number');
  if (needsAI) {
    const ai = await aiHeaderMap(headers, matrix.slice(headerIdx + 1, headerIdx + 6));
    if (ai) {
      const used = new Set(Object.values(ai));
      const merged: Record<string, StdKey> = { ...ai };
      for (const [h, k] of Object.entries(local)) if (!used.has(k) && !merged[h]) { merged[h] = k; used.add(k); }
      headerMap = merged;
      mapSource = 'ai';
    }
  }

  const { rows, skipped } = buildRows(matrix, headerIdx, headerMap);
  return { rows, headers, headerMap, mapSource, skipped };
}

export async function analyzeFile(file: File): Promise<ImportResult> {
  return analyzeMatrix(await matrixFromFile(file));
}

export async function analyzeSheetUrl(url: string): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke('import-table', {
    body: { action: 'fetch_sheet', url },
  });
  if (error) throw new Error('Не вдалося зчитати Google Таблицю');
  const res = data as any;
  if (res?.error) throw new Error(res.message || res.error);
  return analyzeMatrix(matrixFromCsv(String(res.csv ?? '')));
}
