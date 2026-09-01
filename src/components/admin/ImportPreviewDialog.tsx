import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Wand2,
  Users,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import {
  type ImportResult,
  type ImportRow,
  type StdKey,
  FIELD_DEFINITIONS,
  parseWithCustomMapping,
  localHeaderMap,
  detectTeams,
} from '@/lib/importer';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: ImportResult | null;
  busy?: boolean;
  onConfirm: (rows?: ImportRow[]) => void;
}

const FIELD_LABELS: Record<StdKey, string> = {
  is_present: 'Присутність',
  row_number: '№',
  team_number: '№ Команди',
  full_name: 'ПІБ дитини',
  phone: 'Телефон',
  team_name: 'Категорія / Проєкт',
  note_from_table: 'Примітка',
};

const ORDER: StdKey[] = ['full_name', 'team_number', 'phone', 'is_present', 'row_number', 'team_name', 'note_from_table'];

export const ImportPreviewDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  result: initialResult,
  busy = false,
  onConfirm,
}) => {
  if (!initialResult) return null;

  // Local state for active result (allows real-time updates when remapping columns)
  const [activeResult, setActiveResult] = useState<ImportResult>(initialResult);
  const [showManualMapper, setShowManualMapper] = useState(false);
  const [defaultTeam, setDefaultTeam] = useState<number>(1);

  // Sync state when new result comes from props
  useEffect(() => {
    if (initialResult) {
      setActiveResult(initialResult);
    }
  }, [initialResult]);

  const matrix = activeResult.matrix || [];

  // Determine maximum columns in matrix for mapping
  const maxCols = useMemo(() => {
    let m = 0;
    for (let r = 0; r < Math.min(15, matrix.length); r++) {
      if (matrix[r]?.length > m) m = matrix[r].length;
    }
    return Math.max(m, 1);
  }, [matrix]);

  // Initial column mapping dictionary
  const [colMapping, setColMapping] = useState<Record<number, StdKey | 'ignore'>>(() => {
    const map: Record<number, StdKey | 'ignore'> = {};
    const firstRow = (matrix[0] || []).map(String);
    const detected = localHeaderMap(firstRow);

    firstRow.forEach((h, idx) => {
      if (detected[h]) map[idx] = detected[h];
      else map[idx] = 'ignore';
    });

    if (!Object.values(map).includes('full_name')) {
      map[0] = 'full_name';
    }
    return map;
  });

  // Handle column selection change
  const handleColumnChange = (colIdx: number, val: StdKey | 'ignore') => {
    const updated = { ...colMapping, [colIdx]: val };
    setColMapping(updated);

    if (matrix.length > 0) {
      const recomputed = parseWithCustomMapping(matrix, updated, 0, defaultTeam);
      setActiveResult(recomputed);
    }
  };

  // Handle default team change
  const handleDefaultTeamChange = (team: number) => {
    setDefaultTeam(team);
    if (matrix.length > 0) {
      const recomputed = parseWithCustomMapping(matrix, colMapping, 0, team);
      setActiveResult(recomputed);
    }
  };

  const rows = activeResult.rows || [];
  const teams = activeResult.detectedTeams?.length > 0 ? activeResult.detectedTeams : detectTeams(rows);
  const issues = rows.filter((r) => r._issues.length > 0 || r._duplicateWarning);
  const phonesNormalized = rows.filter((r) => r.phone?.startsWith('+380')).length;

  // Validation: Ready if there are valid rows with a name and a team number!
  const validRows = rows.filter((r) => r.full_name && r.team_number > 0);
  const canImport = validRows.length > 0 && !busy;

  const foundKeys = useMemo(() => {
    const set = new Set(Object.values(activeResult.headerMap));
    // If rows were parsed via block list or manual mapping, mark names and teams as found
    if (rows.some((r) => r.full_name)) set.add('full_name');
    if (rows.some((r) => r.team_number > 0)) set.add('team_number');
    if (rows.some((r) => r.phone)) set.add('phone');
    if (rows.some((r) => r.is_present)) set.add('is_present');
    if (rows.some((r) => r.team_name)) set.add('team_name');
    if (rows.some((r) => r.note_from_table)) set.add('note_from_table');
    return set;
  }, [activeResult, rows]);

  const getSourceBadge = () => {
    switch (activeResult.mapSource) {
      case 'block':
        return (
          <Badge variant="secondary" className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20">
            <Sparkles className="w-3 h-3" /> Розпізнано за структурою блоків
          </Badge>
        );
      case 'ai':
        return (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Wand2 className="w-3 h-3" strokeWidth={1.75} /> Колонки визначено ШІ (Groq)
          </Badge>
        );
      case 'manual':
        return (
          <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
            <SlidersHorizontal className="w-3 h-3" /> Налаштовано вручну
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Wand2 className="w-3 h-3" strokeWidth={1.75} /> Колонки визначено словником
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        
        {/* Header */}
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-border/60">
          <DialogTitle className="text-base font-bold">Попередній перегляд імпорту</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Перевір розпізнані дані або налаштуй колонки вручну перед записом у базу.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Summary Banner */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-bold">
                  Виявлено команди у файлі:{' '}
                  <span className="text-primary font-extrabold">
                    {teams.length ? teams.map((t) => `Команда №${t}`).join(', ') : '—'}
                  </span>{' '}
                  — всього {rows.length} дітей
                </p>
              </div>

              {/* Toggle manual mapper */}
              {matrix.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualMapper(!showManualMapper)}
                  className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {showManualMapper ? 'Сховати вибір колонок' : 'Налаштувати колонки вручну'}
                  {showManualMapper ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {getSourceBadge()}
              {ORDER.map((k) => (
                <span
                  key={k}
                  className={`text-[10px] px-2 py-0.5 rounded-md border transition ${
                    foundKeys.has(k)
                      ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                      : 'border-border bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {FIELD_LABELS[k]} · {foundKeys.has(k) ? (k === 'phone' && phonesNormalized ? `+380: ${phonesNormalized}` : 'Знайдено') : 'Не знайдено'}
                </span>
              ))}
            </div>

            {activeResult.skipped > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Пропущено порожніх, службових або дубльованих рядків: {activeResult.skipped}
              </p>
            )}
          </div>

          {/* Manual Column Mapping Section */}
          {showManualMapper && matrix.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Ручне призначення колонок
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Виберіть, яке поле відповідає кожній колонці з таблиці:
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Команда за замовчуванням:</span>
                  <select
                    value={defaultTeam}
                    onChange={(e) => handleDefaultTeamChange(parseInt(e.target.value, 10))}
                    className="bg-background border border-border text-foreground rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((t) => (
                      <option key={t} value={t}>
                        Команда №{t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grid of Column Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {Array.from({ length: maxCols }).map((_, colIdx) => {
                  const sampleVal = matrix.slice(0, 4).map((r) => r[colIdx]).filter(Boolean)[0] || '—';
                  const currentVal = colMapping[colIdx] || 'ignore';

                  return (
                    <div
                      key={colIdx}
                      className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition ${
                        currentVal !== 'ignore'
                          ? 'bg-background border-primary/50 shadow-sm'
                          : 'bg-muted/20 border-border/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          Колонка {String.fromCharCode(65 + colIdx)} (#{colIdx + 1})
                        </span>
                        <span
                          className="text-[10px] text-muted-foreground truncate max-w-[110px]"
                          title={String(sampleVal)}
                        >
                          {String(sampleVal)}
                        </span>
                      </div>

                      <select
                        value={currentVal}
                        onChange={(e) => handleColumnChange(colIdx, e.target.value as StdKey | 'ignore')}
                        className="w-full bg-background border border-border text-foreground rounded-md px-2 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                      >
                        {FIELD_DEFINITIONS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label} {f.required ? '*' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Issues / Warnings */}
          {issues.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-1.5">
              <p className="text-xs font-bold text-warning flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Попередження ({issues.length})
              </p>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {issues.slice(0, 5).map((r, idx) => (
                  <p key={idx} className="text-[11px] text-muted-foreground">
                    Рядок {r._sourceRow}: {r._issues.join(', ')} {r._duplicateWarning ? `(${r._duplicateWarning})` : ''}
                  </p>
                ))}
                {issues.length > 5 && (
                  <p className="text-[11px] text-muted-foreground italic">…і ще {issues.length - 5} записів</p>
                )}
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="rounded-xl border border-border/60 overflow-hidden bg-background">
            <div className="overflow-auto max-h-[38vh]">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b border-border/60 z-10">
                  <tr className="text-left text-muted-foreground font-semibold">
                    <th className="p-2.5 w-12 text-center">№</th>
                    <th className="p-2.5 w-16 text-center">Ком.</th>
                    <th className="p-2.5">ПІБ</th>
                    <th className="p-2.5">Категорія / Проєкт</th>
                    <th className="p-2.5">Телефон</th>
                    <th className="p-2.5 text-center w-14">Прис.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">
                        Не знайдено записів. Спробуйте увімкнути «Налаштувати колонки вручну» зверху.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr
                        key={i}
                        className={`hover:bg-muted/40 transition ${
                          r._issues.length ? 'bg-destructive/10' : ''
                        }`}
                      >
                        <td className="p-2 text-center text-muted-foreground font-mono">{r.row_number ?? i + 1}</td>
                        <td className="p-2 text-center font-bold text-primary">{r.team_number || '—'}</td>
                        <td className="p-2 font-medium">
                          <div className="flex items-center gap-1.5">
                            <span>{r.full_name || <span className="text-destructive">—</span>}</span>
                            {r._duplicateWarning && (
                              <span title={r._duplicateWarning} className="text-warning cursor-help">
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-muted-foreground">{r.team_name || '—'}</td>
                        <td className="p-2 font-mono text-muted-foreground">{r.phone ?? '—'}</td>
                        <td className="p-2 text-center font-semibold">
                          {r.is_present ? <span className="text-emerald-500">✓</span> : <span className="text-muted-foreground/60">—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs">
            {canImport ? (
              <span className="text-emerald-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Готово до імпорту: {validRows.length} дітей
              </span>
            ) : (
              <span className="text-destructive font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Не знайдено обов'язкові колонки ПІБ або № Команди.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="flex-1 sm:flex-none h-10 text-xs"
            >
              Скасувати
            </Button>
            <Button
              type="button"
              onClick={() => onConfirm(validRows)}
              disabled={busy || !canImport}
              className="flex-1 sm:flex-none h-10 text-xs font-bold uppercase tracking-wide gap-1.5 shadow-md"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Підтвердити та створити зміну
                </>
              )}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
};

export default ImportPreviewDialog;
