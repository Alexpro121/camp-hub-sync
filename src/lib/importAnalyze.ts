import { supabase } from '@/integrations/supabase/client';
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

/**
 * Очищення порожніх рядків та нормалізація клітинок матриці
 */
function cleanMatrix(raw: any[][]): any[][] {
  if (!raw || !Array.isArray(raw)) return [];

  const nonEmptyRows = raw.filter((row) =>
    Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
  );

  return nonEmptyRows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell))
  );
}

/**
 * Розпізнає та розгортає багатоколонкові таблиці (Side-by-Side),
 * наприклад, коли Команда 1 у стовпчиках A-C, а Команда 2 у стовпчиках D-F.
 */
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

  // Якщо знайдено дві або більше команди в одному рядку заголовка
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

/**
 * Запит до AI (Groq / Supabase Edge Function) для мапінгу нестандартних заголовків
 */
async function aiHeaderMap(headers: string[], samples: any[][]): Promise<Record<string, StdKey> | null> {
  if (!headers.length) return null;
  try {
    const cleanSamples = samples.map((row) =>
      row.map((cell) => String(cell ?? '').slice(0, 100))
    );

    const { data, error } = await supabase.functions.invoke('import-table', {
      body: { action: 'map_headers', headers, samples: cleanSamples },
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
 * Головний аналізатор матриці:
 * 1. Перевіряє структуру Side-by-Side (команди в паралельних колонках).
 * 2. Перевіряє блоковий / PDF формат (списки за командами).
 * 3. Перевіряє класичну табличну структуру (із застосуванням AI у разі складних колонок).
 */
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

  // 0. Спроба розгорнути Side-by-Side колонки, якщо вони є
  const unrolled = unrollSideBySideTeams(matrix);
  if (unrolled) {
    matrix = cleanMatrix(unrolled);
  }

  // 1. Спроба розпарсити через універсальний блоковий / PDF парсер
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

  // 2. Якщо це не блоковий формат — парсимо як класичну таблицю
  const detectedHeaderIdx = detectHeaderIndex(matrix);
  const effectiveHeaderIdx = detectedHeaderIdx >= 0 ? detectedHeaderIdx : 0;
  const headers = (matrix[effectiveHeaderIdx] || [])
    .map((h: any) => String(h ?? '').trim())
    .filter(Boolean);

  let headerMap = localHeaderMap(headers);
  let mapSource: 'ai' | 'local' = 'local';

  // 3. AI Fuzzy Mapping: викликається лише якщо локальний словник не знайшов обов'язкових колонок
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

  // 4. Побудова фінальних рядків за визначеними заголовками
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

/**
 * Аналізує завантажений файл будь-якого формату (Excel, CSV або PDF)
 */
export async function analyzeFile(file: File): Promise<ImportResult> {
  const matrix = await matrixFromFile(file);
  return analyzeMatrix(matrix);
}

/**
 * Аналізує сирий скопійований текст або вміст з буфера обміну
 */
export async function analyzeRawText(text: string): Promise<ImportResult> {
  const matrix = matrixFromRawText(text);
  return analyzeMatrix(matrix);
}

/**
 * Аналізує PDF-файл з ArrayBuffer
 */
export async function analyzePdfBuffer(buffer: ArrayBuffer): Promise<ImportResult> {
  const matrix = await matrixFromPdf(buffer);
  return analyzeMatrix(matrix);
}

/**
 * Аналізує Google Sheets за посиланням з багаторівневим fallback
 */
export async function analyzeSheetUrl(url: string): Promise<ImportResult> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    throw new Error('Будь ласка, вкажіть посилання на Google Таблицю');
  }

  // Спроба 1: Через Supabase Edge Function
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
    console.warn('Edge Function fetch_sheet failed, trying direct CSV export...', err);
  }

  // Спроба 2: Прямий експорт через публічний CSV URL
  const directCsvUrl = sheetCsvUrl(cleanUrl);
  if (directCsvUrl) {
    try {
      const resp = await fetch(directCsvUrl);
      if (resp.ok) {
        const csvText = await resp.text();
        // Перевіряємо, чи Google не повернув HTML сторінку авторизації
        if (!csvText.trim().toLowerCase().startsWith('<!doctype html') && !csvText.trim().toLowerCase().startsWith('<html')) {
          return analyzeMatrix(matrixFromCsv(csvText));
        }
      }
    } catch (err) {
      console.warn('Direct CSV fetch failed:', err);
    }
  }

  throw new Error(
    'Не вдалося зчитати Google Таблицю. Переконайтеся, що таблиця відкрита для перегляду («Усі, хто має посилання — переглядач») та спробуйте знову.'
  );
}
