import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2, Wand2, Users } from 'lucide-react';
import type { ImportResult, StdKey } from '@/lib/importer';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: ImportResult | null;
  busy?: boolean;
  onConfirm: () => void;
}

const FIELD_LABELS: Record<StdKey, string> = {
  is_present: 'Присутність',
  row_number: '№',
  team_number: '№ Команди',
  full_name: 'ПІБ дитини',
  phone: 'Телефон',
  team_name: 'Команда',
  note_from_table: 'Примітка',
};

const ORDER: StdKey[] = ['full_name', 'team_number', 'phone', 'is_present', 'row_number', 'team_name', 'note_from_table'];

const ImportPreviewDialog = ({ open, onOpenChange, result, busy, onConfirm }: Props) => {
  if (!result) return null;
  const found = new Set(Object.values(result.headerMap));
  const teams = Array.from(new Set(result.rows.map((r) => r.team_number).filter(Boolean))).sort((a, b) => a - b);
  const issues = result.rows.filter((r) => r._issues.length);
  const phonesNormalized = result.rows.filter((r) => r.phone?.startsWith('+380')).length;
  const canImport = result.rows.length > 0 && found.has('full_name') && found.has('team_number');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Попередній перегляд імпорту</DialogTitle>
          <DialogDescription className="text-xs">
            Перевір розпізнані колонки та дані перед записом у базу.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="rounded-xl border border-border/60 bg-surface-1 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm font-bold">
              Успішно зчитано: {result.rows.length} дітей
              {teams.length ? ` у ${teams.length > 1 ? 'командах' : 'команді'} №${teams.join(', №')}` : ''}
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Wand2 className="w-3 h-3" strokeWidth={1.75} />
            {result.mapSource === 'ai' ? 'Колонки визначено ШІ (Groq)' : 'Колонки визначено словником'}
          </Badge>
          <div className="flex flex-wrap gap-1.5">
            {ORDER.map((k) => (
              <span
                key={k}
                className={`text-[10px] px-2 py-1 rounded-md border ${found.has(k) ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/40 text-muted-foreground'}`}
              >
                {FIELD_LABELS[k]} · {found.has(k) ? (k === 'phone' ? `Нормалізовано (+380: ${phonesNormalized})` : 'Знайдено') : 'Не знайдено'}
              </span>
            ))}
          </div>
          {result.skipped > 0 && (
            <p className="text-[11px] text-muted-foreground">Пропущено порожніх/дубльованих рядків: {result.skipped}</p>
          )}
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 space-y-1">
            <p className="text-xs font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Попередження ({issues.length})</p>
            {issues.slice(0, 6).map((r) => (
              <p key={r._sourceRow} className="text-[11px]">{r._issues.join(', ')} у рядку {r._sourceRow}</p>
            ))}
            {issues.length > 6 && <p className="text-[11px] text-muted-foreground">…і ще {issues.length - 6}</p>}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border/60 overflow-auto max-h-[38vh]">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="text-left">
                <th className="p-2 font-bold">№</th>
                <th className="p-2 font-bold">Ком.</th>
                <th className="p-2 font-bold">ПІБ</th>
                <th className="p-2 font-bold">Телефон</th>
                <th className="p-2 font-bold">Прис.</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i} className={`border-t border-border/40 ${r._issues.length ? 'bg-destructive/10' : ''}`}>
                  <td className="p-2 text-muted-foreground">{r.row_number ?? i + 1}</td>
                  <td className="p-2 font-bold">{r.team_number || '—'}</td>
                  <td className="p-2">{r.full_name || <span className="text-destructive">—</span>}</td>
                  <td className="p-2 font-mono">{r.phone ?? '—'}</td>
                  <td className="p-2">{r.is_present ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2">
          <Button onClick={onConfirm} disabled={busy || !canImport} className="h-12 font-bold uppercase">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Підтвердити та створити зміну</>}
          </Button>
          {!canImport && (
            <p className="text-[11px] text-destructive text-center">
              Не знайдено обов'язкові колонки ПІБ та № Команди — перевір таблицю.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportPreviewDialog;
