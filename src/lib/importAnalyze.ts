import { supabase } from '@/integrations/supabase/client';
import { networkPulse } from '@/lib/networkEngine';
import {
  buildRows,
  detectHeaderIndex,
  detectTeams,
  extractTeamNumberFromText,
  localHeaderMap,
  matrixFromCsv,
  matrixFromFile,
  matrixFromPdf,
  matrixFromRawText,
  sheetCsvUrl,
  type ImportResult,
  type StdKey,
} from '@/lib/importer';

function cleanMatrix(raw: any[][]): any[][] {
  if (!raw || !Array.isArray(raw)) return [];

  const nonEmptyRows = raw.filter((row) =>
    Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
  );

  return nonEmptyRows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell))
  );
}

function unrollSideBySideTeams(matrix: any[][]): any[][] | null {
  if (!matrix || matrix.length < 2) return null;

  const firstRow = (matrix[0] || []).map((c) => String(c ?? '').trim());
  const teamPositions: { colIndex: number; teamNum: number }[] = [];

  firstRow.forEach((cell, idx) => {
    const num = extractTeamNumberFromText(cell);
    if (num !== null) {
      teamPositions.push({ colIndex: idx, teamNum: num });
    }
  });

  if (teamPositions.length >= 2) {
    const unrolled: any[][] = [];

    for (let i = 0; i < teamPositions.length; i++) {
      const startCol = teamPositions[i].colIndex;
      const endCol = i + 1 < teamPositions.length ? teamPositions[i + 1].colIndex : firstRow.length;
      const teamNum = teamPositions[i].teamNum;

      unrolled.push([`${teamNum} команда`]);

      for (let r = 1; r < matrix.length; r++) {
        const rowSlice = matrix[r].slice(startCol, endCol);
        if (rowSlice.some((c) => String(c ?? '').trim() !== '')) {
          unrolled.push(rowSlice);
        }
      }
    }

    return unrolled.length > 0 ? unrolled : null;
  }

  return null;
}

async function aiHeaderMap(headers: string[], samples: any[][]): Promise<Record<string, StdKey> | null> {
  if (!headers.length) return null;

  if (!networkPulse.isOnline() || networkPulse.isSlow()) {
    return null;
  }

  try {
    const cleanSamples = samples.map((row) =>
      row.map((cell) => String(cell ?? '').slice(0, 80))
    );

    const { data, error } = await supabase.functions.invoke('import-table', {
      body: { action: 'map_headers', headers, samples: cleanSamples },
    });

    if (error || !data) return null;

    const map = (data as any)?.header_map as Record<string, StdKey> | undefined;
    if (!map || Object.keys(map).length === 0) return null;
    return map;
  } catch {
    return null;
  }
}

export async function analyzeMatrix(rawMatrix: any[][]): Promise<ImportResult> {
  let matrix = cleanMatrix(rawMatrix);

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

  const unrolled = unrollSideBySideTeams(matrix);
  if (unrolled) {
    matrix = cleanMatrix(unrolled);
  }

  const firstPass = buildRows(matrix, -1, {});

  if (firstPass.rows.length >= 1 && firstPass.mapSource === 'block') {
    return {
      rows: firstPass.rows,
      headers: firstPass.headers,
      headerMap: firstPass.headerMap,
      mapSource: firstPass.mapSource,
      skipped: firstPass.skipped,
      detectedTeams: firstPass.detectedTeams.length > 0 ? firstPass.detectedTeams : detectTeams(firstPass.rows),
      matrix,
    };
  }

  const detectedHeaderIdx = detectHeaderIndex(matrix);
  const effectiveHeaderIdx = detectedHeaderIdx >= 0 ? detectedHeaderIdx : 0;
  const headers = (matrix[effectiveHeaderIdx] || [])
    .map((h: any) => String(h ?? '').trim())
    .filter(Boolean);

  let headerMap = localHeaderMap(headers);
  let mapSource: 'ai' | 'local' = 'local';

  const hasFullName = Object.values(headerMap).includes('full_name');
  const hasTeam = Object.values(headerMap).includes('team_number');

  if ((!hasFullName || !hasTeam) && headers.length >= 2 && networkPulse.isOnline() && !networkPulse.isSlow()) {
    const sampleRows = matrix.slice(effectiveHeaderIdx + 1, effectiveHeaderIdx + 5);
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

  const finalResult = buildRows(matrix, effectiveHeaderIdx, headerMap);
  const detectedTeams = detectTeams(finalResult.rows);

  return {
    rows: finalResult.rows,
    headers: headers.length > 0 ? headers : Object.keys(headerMap),
    headerMap: Object.keys(headerMap).length > 0 ? headerMap : finalResult.headerMap,
    mapSource: finalResult.mapSource || mapSource,
    skipped: finalResult.skipped,
    detectedTeams: detectedTeams.length > 0 ? detectedTeams : finalResult.detectedTeams,
    matrix,
  };
}

export async function analyzeFile(file: File): Promise<ImportResult> {
  const matrix = await matrixFromFile(file);
  return analyzeMatrix(matrix);
}

export async function analyzeRawText(text: string): Promise<ImportResult> {
  const matrix = matrixFromRawText(text);
  return analyzeMatrix(matrix);
}

export async function analyzePdfBuffer(buffer: ArrayBuffer): Promise<ImportResult> {
  const matrix = await matrixFromPdf(buffer);
  return analyzeMatrix(matrix);
}

export async function analyzeSheetUrl(url: string): Promise<ImportResult> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    throw new Error('Будь ласка, вкажіть посилання на Google Таблицю');
  }

  if (!networkPulse.isOnline()) {
    throw new Error('Немає підключення до інтернету. Імпорт за посиланням Google Таблиць недоступний в офлайні.');
  }

  try {
    const { data, error } = await supabase.functions.invoke('import-table', {
      body: { action: 'fetch_sheet', url: cleanUrl },
    });

    if (!error && data) {
      const res = data as any;
      if (res.csv) return analyzeMatrix(matrixFromCsv(String(res.csv)));
      if (res.matrix && Array.isArray(res.matrix)) return analyzeMatrix(res.matrix);
    }
  } catch {
    // Fallback
  }

  const directCsvUrl = sheetCsvUrl(cleanUrl);
  if (directCsvUrl) {
    try {
      const resp = await fetch(directCsvUrl);
      if (resp.ok) {
        const csvText = await resp.text();
        if (!csvText.trim().toLowerCase().startsWith('<!doctype html') && !csvText.trim().toLowerCase().startsWith('<html')) {
          return analyzeMatrix(matrixFromCsv(csvText));
        }
      }
    } catch {
      // Ignored
    }
  }

  throw new Error(
    'Не вдалося завантажити Google Таблицю. Перевірте доступ («Усі, хто має посилання — переглядач») або завантажте файл як PDF/Excel.'
  );
}
