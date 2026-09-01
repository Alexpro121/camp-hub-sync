import { supabase } from '@/integrations/supabase/client';
import {
  buildRows,
  detectHeaderIndex,
  detectTeams,
  localHeaderMap,
  matrixFromCsv,
  matrixFromFile,
  sheetCsvUrl,
  type ImportResult,
  type StdKey,
} from '@/lib/importer';

/**
 * Clean up leading/trailing empty rows and normalize matrix cells
 */
function cleanMatrix(raw: any[][]): any[][] {
  if (!raw || !Array.isArray(raw)) return [];

  // Filter out completely empty rows
  const nonEmptyRows = raw.filter((row) =>
    Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
  );

  return nonEmptyRows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell))
  );
}

/**
 * Ask Groq/AI to map messy headers; silently falls back to null on failure.
 */
async function aiHeaderMap(headers: string[], samples: any[][]): Promise<Record<string, StdKey> | null> {
  if (!headers.length) return null;
  try {
    const { data, error } = await supabase.functions.invoke('import-table', {
      body: { action: 'map_headers', headers, samples },
    });

    if (error) {
      console.warn('AI header mapping invocation error:', error);
      return null;
    }

    const map = (data as any)?.header_map as Record<string, StdKey> | undefined;
    if (!map || Object.keys(map).length === 0) return null;
    return map;
  } catch (err) {
    console.warn('AI header mapping network failure:', err);
    return null;
  }
}

/**
 * Master analyzer that inspects any 2D matrix, selects the optimal strategy
 * (Block List, Side-by-Side Teams, or Classic Multi-Column Table),
 * and performs AI fuzzy matching when needed.
 */
export async function analyzeMatrix(rawMatrix: any[][]): Promise<ImportResult> {
  const matrix = cleanMatrix(rawMatrix);

  if (!matrix.length) {
    return {
      rows: [],
      headers: [],
      headerMap: {},
      mapSource: 'local',
      skipped: 0,
      detectedTeams: [],
      matrix: [],
    };
  }

  // 1. First Attempt: Run the universal parser
  // This immediately checks if the file is a Block List (e.g., "1 команда", "2 команда"...)
  // or a Side-by-Side column structure.
  const firstPass = buildRows(matrix, -1, {});

  // If Block parser or Side-by-Side parser matched successfully (found kids & teams)
  if (firstPass.rows.length >= 3 && firstPass.rows.every((r) => r.full_name && r.team_number > 0)) {
    const detected = (firstPass as any).detectedTeams || detectTeams(firstPass.rows);
    return {
      rows: firstPass.rows,
      headers: (firstPass as any).headers || ['ПІБ', 'Команда', 'Телефон', 'Присутність'],
      headerMap: (firstPass as any).headerMap || {
        'ПІБ': 'full_name',
        'Команда': 'team_number',
      },
      mapSource: (firstPass as any).mapSource || 'block',
      skipped: firstPass.skipped,
      detectedTeams: detected,
      matrix,
    };
  }

  // 2. If not a block list, treat as Classic Multi-Column Table
  const detectedHeaderIdx = detectHeaderIndex(matrix);
  const effectiveHeaderIdx = detectedHeaderIdx >= 0 ? detectedHeaderIdx : 0;
  const headers = (matrix[effectiveHeaderIdx] || [])
    .map((h: any) => String(h ?? '').trim())
    .filter(Boolean);

  let headerMap = localHeaderMap(headers);
  let mapSource: 'ai' | 'local' = 'local';

  // 3. AI Fuzzy Mapping: Trigger only if local dictionary missed crucial columns ('full_name' or 'team_number')
  const hasFullName = Object.values(headerMap).includes('full_name');
  const hasTeam = Object.values(headerMap).includes('team_number');

  if ((!hasFullName || !hasTeam) && headers.length >= 2) {
    const sampleRows = matrix.slice(effectiveHeaderIdx + 1, effectiveHeaderIdx + 6);
    const aiMap = await aiHeaderMap(headers, sampleRows);

    if (aiMap && Object.keys(aiMap).length > 0) {
      const used = new Set(Object.values(aiMap));
      const merged: Record<string, StdKey> = { ...aiMap };

      for (const [h, k] of Object.entries(headerMap)) {
        if (!used.has(k) && !merged[h]) {
          merged[h] = k;
          used.add(k);
        }
      }
      headerMap = merged;
      mapSource = 'ai';
    }
  }

  // 4. Build final rows using determined headers and column mapping
  const finalResult = buildRows(matrix, effectiveHeaderIdx, headerMap);
  const detectedTeams = detectTeams(finalResult.rows);

  return {
    rows: finalResult.rows,
    headers: headers.length > 0 ? headers : Object.keys(headerMap),
    headerMap: Object.keys(headerMap).length > 0 ? headerMap : (finalResult as any).headerMap || {},
    mapSource: (finalResult as any).mapSource || mapSource,
    skipped: finalResult.skipped,
    detectedTeams: detectedTeams.length > 0 ? detectedTeams : (finalResult as any).detectedTeams || [],
    matrix,
  };
}

/**
 * Analyzes an uploaded Excel / CSV file
 */
export async function analyzeFile(file: File): Promise<ImportResult> {
  const matrix = await matrixFromFile(file);
  return analyzeMatrix(matrix);
}

/**
 * Analyzes a Google Sheets URL with fallback resilience
 */
export async function analyzeSheetUrl(url: string): Promise<ImportResult> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    throw new Error('Будь ласка, вкажіть посилання на Google Таблицю');
  }

  // Attempt 1: Via Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('import-table', {
      body: { action: 'fetch_sheet', url: cleanUrl },
    });

    if (!error && data) {
      const res = data as any;
      if (res.csv) {
        return analyzeMatrix(matrixFromCsv(String(res.csv)));
      }
      if (res.matrix && Array.isArray(res.matrix)) {
        return analyzeMatrix(res.matrix);
      }
    }
  } catch (err) {
    console.warn('Edge Function fetch_sheet failed, trying direct public CSV export...', err);
  }

  // Attempt 2: Fallback to direct public CSV export URL
  const directCsvUrl = sheetCsvUrl(cleanUrl);
  if (directCsvUrl) {
    try {
      const resp = await fetch(directCsvUrl);
      if (resp.ok) {
        const csvText = await resp.text();
        return analyzeMatrix(matrixFromCsv(csvText));
      }
    } catch (err) {
      console.warn('Direct CSV fetch failed:', err);
    }
  }

  throw new Error(
    'Не вдалося зчитати Google Таблицю. Переконайтеся, що посилання правильне та в налаштуваннях доступу вибрано «Усі, хто має посилання — переглядач».'
  );
}
