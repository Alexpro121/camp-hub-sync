import { supabase } from '@/integrations/supabase/client';
import { analyzeFile, analyzeSheetUrl } from '@/lib/importAnalyze';
import { detectTeams, toDbRow, type ImportResult, type ImportRow } from '@/lib/importer';
import { normalizeName } from '@/lib/normalize';

export type MultiFileStatus = 'pending' | 'analyzing' | 'ready' | 'error';

export interface MultiFileSource {
  id: string;
  label: string;
  kind: 'file' | 'sheet';
  file?: File;
  sheetUrl?: string;
  status: MultiFileStatus;
  error?: string | null;
  /** Зсув номерів команд для цього джерела (наприклад +4) */
  teamOffset: number;
  result?: ImportResult | null;
}

export interface CrossFileDuplicate {
  key: string;
  fullName: string;
  teamNumber: number;
  sources: string[];
  /** true — повний збіг ПІБ+команда, false — лише однофамільці */
  exact: boolean;
}

export interface MultiFileSummary {
  totalRows: number;
  uniqueRows: number;
  teams: number[];
  perTeam: Record<number, number>;
  duplicates: CrossFileDuplicate[];
}

export const newSourceId = () =>
  `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function makeFileSource(file: File): MultiFileSource {
  return { id: newSourceId(), label: file.name, kind: 'file', file, status: 'pending', teamOffset: 0 };
}

export function makeSheetSource(url: string): MultiFileSource {
  const clean = url.trim();
  return { id: newSourceId(), label: clean, kind: 'sheet', sheetUrl: clean, status: 'pending', teamOffset: 0 };
}

/** Аналізує одне джерело (файл або Google Таблицю). */
export async function analyzeSource(src: MultiFileSource): Promise<ImportResult> {
  if (src.kind === 'file' && src.file) return analyzeFile(src.file);
  if (src.kind === 'sheet' && src.sheetUrl) return analyzeSheetUrl(src.sheetUrl);
  throw new Error('Невідоме джерело імпорту');
}

/** Застосовує зсув номерів команд до рядків джерела. */
export function applyTeamOffset(rows: ImportRow[], offset: number): ImportRow[] {
  if (!offset) return rows;
  return rows.map((r) => ({ ...r, team_number: Math.max(1, (r.team_number || 0) + offset) }));
}

/** Команди джерела з урахуванням зсуву. */
export function sourceTeams(src: MultiFileSource): number[] {
  const rows = src.result?.rows ?? [];
  return detectTeams(applyTeamOffset(rows, src.teamOffset));
}

const lastName = (full: string) => normalizeName(full).split(' ')[0] || '';

/**
 * Зводить усі джерела в один список із крос-файловою дедуплікацією.
 * Повні дублікати (ПІБ+команда) залишаються в одному екземплярі.
 */
export function mergeSources(sources: MultiFileSource[]): { rows: ImportRow[]; summary: MultiFileSummary } {
  const seen = new Map<string, { row: ImportRow; sources: string[] }>();
  const byLastName = new Map<string, Set<string>>();
  const duplicates: CrossFileDuplicate[] = [];
  let totalRows = 0;

  for (const src of sources) {
    if (src.status !== 'ready' || !src.result) continue;
    const rows = applyTeamOffset(src.result.rows, src.teamOffset).filter(
      (r) => r.full_name && r.team_number
    );
    for (const row of rows) {
      totalRows++;
      const key = `${row.team_number}|${normalizeName(row.full_name)}`;
      const hit = seen.get(key);
      if (hit) {
        if (!hit.sources.includes(src.label)) hit.sources.push(src.label);
        duplicates.push({
          key,
          fullName: row.full_name,
          teamNumber: row.team_number,
          sources: [...hit.sources],
          exact: true,
        });
        continue;
      }
      seen.set(key, { row, sources: [src.label] });

      const ln = lastName(row.full_name);
      if (ln.length > 2) {
        const set = byLastName.get(ln) ?? new Set<string>();
        set.add(src.label);
        byLastName.set(ln, set);
      }
    }
  }

  // Однофамільці між різними файлами
  for (const [ln, srcSet] of byLastName) {
    if (srcSet.size < 2) continue;
    const sample = [...seen.values()].find((v) => lastName(v.row.full_name) === ln);
    if (!sample) continue;
    duplicates.push({
      key: `ln|${ln}`,
      fullName: sample.row.full_name,
      teamNumber: sample.row.team_number,
      sources: [...srcSet],
      exact: false,
    });
  }

  const rows = [...seen.values()].map((v) => v.row);
  const perTeam: Record<number, number> = {};
  rows.forEach((r) => { perTeam[r.team_number] = (perTeam[r.team_number] ?? 0) + 1; });

  return {
    rows,
    summary: {
      totalRows,
      uniqueRows: rows.length,
      teams: detectTeams(rows),
      perTeam,
      duplicates,
    },
  };
}

export interface MultiShiftPayload {
  name: string;
  shift_type: string;
  shift_category: string;
  start_date: string;
  end_date: string;
  assigned_teams: number[];
  travel_start_date?: string | null;
  hotel_start_date?: string | null;
  team_offset?: number;
  is_active?: boolean;
}

export interface CommitResult {
  shiftId: string;
  inserted: number;
  files: number;
}

const CHUNK = 50;

/**
 * Пакетний запис: створює зміну, зберігає всі файли в uploaded_files
 * та записує дітей чанками по 50. При помилці — відкат створеної зміни.
 */
export async function commitMultiFileShift(
  payload: MultiShiftPayload,
  sources: MultiFileSource[],
  onProgress?: (pct: number, label: string) => void
): Promise<CommitResult> {
  const { rows, summary } = mergeSources(sources);
  if (!rows.length) throw new Error('Немає учасників для імпорту');

  onProgress?.(5, 'Створення зміни');
  const teams = [...new Set([...(payload.assigned_teams ?? []), ...summary.teams])].sort((a, b) => a - b);

  const { data: shift, error: shErr } = await supabase
    .from('shifts')
    .insert({
      ...payload,
      assigned_teams: teams,
      team_offset: payload.team_offset ?? 0,
      is_active: payload.is_active ?? true,
    } as any)
    .select()
    .single();
  if (shErr || !shift) throw shErr || new Error('Не вдалося створити зміну');

  const shiftId = (shift as any).id as string;

  try {
    const readySources = sources.filter((s) => s.status === 'ready' && s.result);
    if (readySources.length) {
      onProgress?.(15, 'Збереження джерел');
      const { error: filesErr } = await supabase.from('uploaded_files').insert(
        readySources.map((s) => ({
          filename: s.label,
          shift_id: shiftId,
          rows_count: applyTeamOffset(s.result!.rows, s.teamOffset).filter((r) => r.full_name && r.team_number).length,
        }))
      );
      if (filesErr) throw filesErr;
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => toDbRow(r, shiftId));
      const { error } = await supabase.from('children').insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
      onProgress?.(20 + Math.round((inserted / rows.length) * 78), `Учасники ${inserted}/${rows.length}`);
    }

    onProgress?.(100, 'Готово');
    return { shiftId, inserted, files: readySources.length };
  } catch (err) {
    // Відкат: прибираємо частково створені дані
    await supabase.from('children').delete().eq('shift_id', shiftId);
    await supabase.from('uploaded_files').delete().eq('shift_id', shiftId);
    await supabase.from('shifts').delete().eq('id', shiftId);
    throw err;
  }
}
