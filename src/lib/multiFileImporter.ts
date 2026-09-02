import { supabase } from '@/integrations/supabase/client';
import { analyzeFile, analyzeSheetUrl, analyzeRawText } from '@/lib/importAnalyze';
import { detectTeams, toDbRow, type ImportResult, type ImportRow } from '@/lib/importer';
import { normalizeName } from '@/lib/normalize';
import type { Shift, ShiftType, ShiftCategory } from '@/types/app';

export type MultiFileStatus = 'pending' | 'analyzing' | 'ready' | 'error';
export type MultiFileKind = 'file' | 'sheet' | 'text';

export interface MultiFileSource {
  id: string;
  label: string;
  kind: MultiFileKind;
  file?: File;
  sheetUrl?: string;
  rawText?: string;
  status: MultiFileStatus;
  error?: string | null;
  /** Зсув номерів команд для цього джерела (наприклад +4) */
  teamOffset: number;
  /** Ручний точковий мапінг номерів команд: { 1: 5, 2: 6 } */
  customTeamMap?: Record<number, number>;
  result?: ImportResult | null;
}

export type DuplicateKind = 'exact' | 'cross_team' | 'namesake';

export interface CrossFileDuplicate {
  key: string;
  kind: DuplicateKind;
  fullName: string;
  allNames?: string[];
  teamNumbers: number[];
  sources: string[];
  phone?: string | null;
  description: string;
}

export interface MultiFileSummary {
  totalRows: number;
  uniqueRows: number;
  teams: number[];
  perTeam: Record<number, number>;
  duplicates: CrossFileDuplicate[];
  filesBreakdown: { label: string; count: number; teams: number[] }[];
}

/** Безпечна генерація ID джерела */
export const newSourceId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `src_${crypto.randomUUID()}`;
  }
  return `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

export function makeFileSource(file: File): MultiFileSource {
  return {
    id: newSourceId(),
    label: file.name,
    kind: 'file',
    file,
    status: 'pending',
    teamOffset: 0,
  };
}

export function makeSheetSource(url: string): MultiFileSource {
  const clean = url.trim();
  return {
    id: newSourceId(),
    label: clean.length > 35 ? `${clean.slice(0, 35)}...` : clean,
    kind: 'sheet',
    sheetUrl: clean,
    status: 'pending',
    teamOffset: 0,
  };
}

export function makeTextSource(text: string, label = 'Вставлений текст'): MultiFileSource {
  return {
    id: newSourceId(),
    label,
    kind: 'text',
    rawText: text,
    status: 'pending',
    teamOffset: 0,
  };
}

/** Аналізує одне джерело (файл, Google Таблицю або сирий текст) */
export async function analyzeSource(src: MultiFileSource): Promise<ImportResult> {
  if (src.kind === 'file' && src.file) {
    return analyzeFile(src.file);
  }
  if (src.kind === 'sheet' && src.sheetUrl) {
    return analyzeSheetUrl(src.sheetUrl);
  }
  if (src.kind === 'text' && src.rawText) {
    return analyzeRawText(src.rawText);
  }
  throw new Error('Невідоме або порожнє джерело імпорту');
}

/** Застосовує зсув або індивідуальний мапінг номерів команд */
export function applyTeamMapping(
  rows: ImportRow[],
  offset = 0,
  customMap?: Record<number, number>
): ImportRow[] {
  if (!offset && (!customMap || Object.keys(customMap).length === 0)) {
    return rows;
  }

  return rows.map((r) => {
    let finalTeam = r.team_number || 0;

    if (customMap && customMap[finalTeam] !== undefined) {
      finalTeam = customMap[finalTeam];
    } else if (offset > 0) {
      finalTeam = finalTeam + offset;
    }

    return {
      ...r,
      team_number: Math.max(1, finalTeam),
    };
  });
}

/** Команди джерела з урахуванням зсуву та мапінгу */
export function sourceTeams(src: MultiFileSource): number[] {
  const rows = src.result?.rows ?? [];
  return detectTeams(applyTeamMapping(rows, src.teamOffset, src.customTeamMap));
}

const getLastName = (full: string) => normalizeName(full).split(' ')[0] || '';

/**
 * Зводить усі джерела в один список із розширеною крос-файловою дедуплікацією.
 */
export function mergeSources(sources: MultiFileSource[]): { rows: ImportRow[]; summary: MultiFileSummary } {
  const seenExact = new Map<string, { row: ImportRow; sources: Set<string> }>();
  const seenByName = new Map<string, { row: ImportRow; source: string; team: number }[]>();
  const byLastName = new Map<string, { fullName: string; source: string; team: number }[]>();

  const duplicatesMap = new Map<string, CrossFileDuplicate>();
  const filesBreakdown: { label: string; count: number; teams: number[] }[] = [];
  let totalRows = 0;

  for (const src of sources) {
    if (src.status !== 'ready' || !src.result) continue;

    const mappedRows = applyTeamMapping(src.result.rows, src.teamOffset, src.customTeamMap).filter(
      (r) => r.full_name && r.team_number
    );

    const srcTeams = new Set<number>();

    for (const row of mappedRows) {
      totalRows++;
      srcTeams.add(row.team_number);

      const normFullName = normalizeName(row.full_name);
      const exactKey = `${row.team_number}|${normFullName}`;

      // 1. ПОВНИЙ ДУБЛІКАТ (той самий ПІБ + та сама команда)
      const existingExact = seenExact.get(exactKey);
      if (existingExact) {
        existingExact.sources.add(src.label);

        // Об'єднуємо нотатки / телефон, якщо в одному з файлів їх не було
        if (!existingExact.row.phone && row.phone) existingExact.row.phone = row.phone;
        if (!existingExact.row.note_from_table && row.note_from_table) {
          existingExact.row.note_from_table = row.note_from_table;
        }

        duplicatesMap.set(exactKey, {
          key: exactKey,
          kind: 'exact',
          fullName: row.full_name,
          teamNumbers: [row.team_number],
          sources: Array.from(existingExact.sources),
          phone: row.phone || existingExact.row.phone,
          description: `Повний дублікат: знайдено в кількох джерелах для Команди ${row.team_number}`,
        });
        continue;
      }

      seenExact.set(exactKey, { row, sources: new Set([src.label]) });

      // 2. ДЕТЕКЦІЯ ЗБІГУ МІЖ РІЗНИМИ КОМАНДАМИ (Cross-Team)
      const nameEntries = seenByName.get(normFullName) ?? [];
      nameEntries.push({ row, source: src.label, team: row.team_number });
      seenByName.set(normFullName, nameEntries);

      // 3. ЗБІР ДЛЯ ОДНОФАМІЛЬЦІВ
      const ln = getLastName(row.full_name);
      if (ln.length >= 3) {
        const lnEntries = byLastName.get(ln) ?? [];
        lnEntries.push({ fullName: row.full_name, source: src.label, team: row.team_number });
        byLastName.set(ln, lnEntries);
      }
    }

    filesBreakdown.push({
      label: src.label,
      count: mappedRows.length,
      teams: Array.from(srcTeams).sort((a, b) => a - b),
    });
  }

  // Аналіз міжкомандних збігів (однаковий ПІБ у різних командах)
  for (const [normName, entries] of seenByName) {
    const uniqueTeams = Array.from(new Set(entries.map((e) => e.team)));
    if (uniqueTeams.length > 1) {
      const srcList = Array.from(new Set(entries.map((e) => e.source)));
      const sample = entries[0];
      const crossKey = `cross|${normName}`;

      duplicatesMap.set(crossKey, {
        key: crossKey,
        kind: 'cross_team',
        fullName: sample.row.full_name,
        teamNumbers: uniqueTeams.sort((a, b) => a - b),
        sources: srcList,
        phone: sample.row.phone,
        description: `Увага! Той самий ПІБ закріплено за різними командами: ${uniqueTeams.join(', ')}`,
      });
    }
  }

  // Аналіз однофамільців (різні імена з однаковим прізвищем у різних джерелах)
  for (const [ln, entries] of byLastName) {
    const uniqueFullNames = Array.from(new Set(entries.map((e) => e.fullName)));
    const uniqueSources = Array.from(new Set(entries.map((e) => e.source)));

    // Якщо є різні люди з цим прізвищем між різними файлами
    if (uniqueFullNames.length > 1 && uniqueSources.length > 1) {
      const lnKey = `ln|${ln}`;
      if (!duplicatesMap.has(lnKey)) {
        duplicatesMap.set(lnKey, {
          key: lnKey,
          kind: 'namesake',
          fullName: `Прізвище «${entries[0].fullName.split(' ')[0]}» (${uniqueFullNames.length} осіб)`,
          allNames: uniqueFullNames,
          teamNumbers: Array.from(new Set(entries.map((e) => e.team))).sort((a, b) => a - b),
          sources: uniqueSources,
          description: `Однофамільці у різних файлах: ${uniqueFullNames.join(', ')}`,
        });
      }
    }
  }

  const finalRows = Array.from(seenExact.values()).map((v) => v.row);

  const perTeam: Record<number, number> = {};
  finalRows.forEach((r) => {
    perTeam[r.team_number] = (perTeam[r.team_number] ?? 0) + 1;
  });

  return {
    rows: finalRows,
    summary: {
      totalRows,
      uniqueRows: finalRows.length,
      teams: detectTeams(finalRows),
      perTeam,
      duplicates: Array.from(duplicatesMap.values()),
      filesBreakdown,
    },
  };
}

export interface MultiShiftPayload {
  name: string;
  shift_type: ShiftType;
  shift_category?: ShiftCategory | null;
  start_date: string;
  end_date: string;
  assigned_teams?: number[];
  travel_start_date?: string | null;
  hotel_start_date?: string | null;
  team_offset?: number;
  is_active?: boolean;
}

export interface CommitResult {
  shiftId: string;
  shift: Shift;
  inserted: number;
  files: number;
}

const CHUNK_SIZE = 50;

/**
 * Пакетний атомарний запис:
 * 1. Створює зміну в `shifts`.
 * 2. Реєструє файли в `uploaded_files`.
 * 3. Записує дітей чанками по 50 записів.
 * 4. У разі збою — виконує повний відкат без залишення «сміття» в базі.
 */
export async function commitMultiFileShift(
  payload: MultiShiftPayload,
  sources: MultiFileSource[],
  onProgress?: (pct: number, label: string) => void
): Promise<CommitResult> {
  const { rows, summary } = mergeSources(sources);
  if (!rows.length) {
    throw new Error('Немає валідних учасників для імпорту');
  }

  onProgress?.(5, 'Створення запису зміни...');
  const teams = Array.from(new Set([...(payload.assigned_teams ?? []), ...summary.teams])).sort(
    (a, b) => a - b
  );

  const { data: shift, error: shErr } = await supabase
    .from('shifts')
    .insert({
      name: payload.name,
      shift_type: payload.shift_type,
      shift_category: payload.shift_category || payload.shift_type,
      start_date: payload.start_date,
      end_date: payload.end_date,
      travel_start_date: payload.travel_start_date || null,
      hotel_start_date: payload.hotel_start_date || null,
      assigned_teams: teams,
      team_offset: payload.team_offset ?? 0,
      is_active: payload.is_active ?? true,
    })
    .select('*')
    .single();

  if (shErr || !shift) {
    throw shErr || new Error('Не вдалося створити зміну в базі даних');
  }

  const shiftId = (shift as any).id as string;

  try {
    const readySources = sources.filter((s) => s.status === 'ready' && s.result);

    // 2. Збереження джерел у uploaded_files
    if (readySources.length) {
      onProgress?.(15, 'Збереження реєстру джерел...');
      const { error: filesErr } = await supabase.from('uploaded_files').insert(
        readySources.map((s) => ({
          filename: s.label,
          shift_id: shiftId,
          rows_count: applyTeamMapping(s.result!.rows, s.teamOffset, s.customTeamMap).filter(
            (r) => r.full_name && r.team_number
          ).length,
        }))
      );
      if (filesErr) throw filesErr;
    }

    // 3. Запис дітей пакетами
    let inserted = 0;
    const total = rows.length;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE).map((r) => toDbRow(r, shiftId));
      const { error: insertErr } = await supabase.from('children').insert(chunk);

      if (insertErr) {
        throw new Error(`Помилка запису частини бази (${i}..${i + chunk.length}): ${insertErr.message}`);
      }

      inserted += chunk.length;
      const progressPercent = 20 + Math.round((inserted / total) * 78);
      onProgress?.(progressPercent, `Запис учасників: ${inserted} із ${total}...`);
    }

    onProgress?.(100, 'Зміну та базу учасників успішно створено!');
    return {
      shiftId,
      shift: shift as Shift,
      inserted,
      files: readySources.length,
    };
  } catch (err) {
    console.error('[MultiImport] Помилка пакетного імпорту, виконується відкат:', err);

    // Відкат: безпечно очищаємо частково створені сутності
    await Promise.allSettled([
      supabase.from('children').delete().eq('shift_id', shiftId),
      supabase.from('uploaded_files').delete().eq('shift_id', shiftId),
      supabase.from('shifts').delete().eq('id', shiftId),
    ]);

    throw err;
  }
}
