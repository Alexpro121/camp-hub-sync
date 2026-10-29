import { AlertTriangle, Check, MapPin, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ImportPreview } from '@/lib/scheduleImport';

interface Props {
  preview: ImportPreview;
  live?: boolean;
  editing: boolean;
  onEditingChange: (value: boolean) => void;
  onEdit: (day: string, index: number, field: 'title' | 'time_start' | 'time_end', value: string) => void;
}

export function ScheduleImportReview({ preview, live, editing, onEditingChange, onEdit }: Props) {
  return <section className="min-w-0 space-y-4" aria-label="Перевірка розкладу">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <div>
        <h3 className="text-lg font-semibold tabular-nums">{preview.total} подій · {preview.days.length} дн.</h3>
        <p role="status" className="text-xs text-muted-foreground">{live ? 'Генерація триває' : preview.errors.length ? 'Потрібні уточнення' : 'Перевірено · готово до збереження'}</p>
      </div>
      {!live && <Button variant="outline" size="sm" onClick={() => onEditingChange(!editing)}><Pencil className="mr-2 size-3.5" />{editing ? 'Завершити редагування' : 'Редагувати'}</Button>}
    </div>
    {preview.errors.length > 0 && <div role="alert" className="space-y-2 text-sm text-destructive">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 shrink-0" />Виправте помилки перед збереженням</p>
      <ul className="list-disc space-y-1 break-words pl-5">{preview.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
    </div>}
    {preview.duplicates > 0 && <p className="text-xs text-muted-foreground">Повторів прибрано: {preview.duplicates}</p>}
    {preview.warnings.length > 0 && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Уточнення: {preview.warnings.length}</summary><ul className="list-disc space-y-1 break-words pl-5 pt-2">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    {preview.days.map((day) => <div key={day.date}>
      <h4 className="sticky top-0 z-10 border-b border-border bg-background py-3 text-sm font-semibold">{new Date(`${day.date}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', weekday: 'short' })}<span className="ml-2 font-normal text-muted-foreground">{day.items.length} подій</span></h4>
      <ol className="divide-y divide-border">{day.items.map((item, index) => <li key={`${day.date}-${index}`} className="py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1">
        {editing ? <div className="space-y-2">
          <Input aria-label={`Назва події ${index + 1}, ${day.date}`} value={item.title} onChange={(event) => onEdit(day.date, index, 'title', event.target.value)} />
          <div className="grid grid-cols-2 gap-2"><Input type="time" aria-label={`Початок події ${index + 1}, ${day.date}`} value={item.time_start} onChange={(event) => onEdit(day.date, index, 'time_start', event.target.value)} /><Input type="time" aria-label={`Кінець події ${index + 1}, ${day.date}`} value={item.time_end ?? ''} onChange={(event) => onEdit(day.date, index, 'time_end', event.target.value)} /></div>
        </div> : <div className="flex gap-3">
          <div className="w-24 shrink-0 font-mono text-sm tabular-nums"><p className="font-semibold">{item.time_start}</p>{item.time_end && <p className="text-xs text-muted-foreground">до {item.time_end}</p>}</div>
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.target_teams.length ? `Команди ${item.target_teams.join(', ')}` : 'Усі команди'}{item.sub_slots.length ? ` · Заїздів: ${item.sub_slots.length}` : ''}</p>{item.location && <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" />{item.location}</p>}{item.description && <p className="mt-2 break-words text-xs text-muted-foreground">{item.description}</p>}</div>
          {!live && <Check className="mt-1 size-3.5 shrink-0 text-muted-foreground" />}
        </div>}
      </li>)}</ol>
    </div>)}
  </section>;
}