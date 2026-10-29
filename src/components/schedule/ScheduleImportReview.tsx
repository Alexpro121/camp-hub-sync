import { useEffect, useRef } from 'react';
import { AlertTriangle, Check, MapPin, Pencil, Utensils, Dumbbell, Music2, Users, Bus, CalendarDays, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ImportPreview } from '@/lib/scheduleImport';
import { scheduleImportKey } from '@/lib/scheduleImport';

const categories = {
  meal: { accent: 'border-l-cat-meal', text: 'text-cat-meal', surface: 'bg-cat-meal/10', icon: Utensils, label: 'Харчування' },
  sports: { accent: 'border-l-cat-sports', text: 'text-cat-sports', surface: 'bg-cat-sports/10', icon: Dumbbell, label: 'Спорт' },
  entertainment: { accent: 'border-l-cat-event', text: 'text-cat-event', surface: 'bg-cat-event/10', icon: Music2, label: 'Подія' },
  gathering: { accent: 'border-l-cat-gathering', text: 'text-cat-gathering', surface: 'bg-cat-gathering/10', icon: Users, label: 'Зустріч' },
  transfer: { accent: 'border-l-cat-transfer', text: 'text-cat-transfer', surface: 'bg-cat-transfer/10', icon: Bus, label: 'Поїздка' },
  general: { accent: 'border-l-cat-general', text: 'text-cat-general', surface: 'bg-cat-general/10', icon: CalendarDays, label: 'Розклад' },
};

interface Props {
  preview: ImportPreview;
  live?: boolean;
  newestEvent?: string;
  editing: boolean;
  onEditingChange: (value: boolean) => void;
  onEdit: (day: string, index: number, field: 'title' | 'time_start' | 'time_end', value: string) => void;
}

export function ScheduleImportReview({ preview, live, newestEvent, editing, onEditingChange, onEdit }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const newest = useRef<HTMLLIElement>(null);
  const nearBottom = useRef(true);
  const scrollToNewest = () => {
    const list = scroller.current;
    const card = newest.current;
    if (!list || !card) return;
    const top = list.scrollTop + card.getBoundingClientRect().top - list.getBoundingClientRect().top - 48;
    list.scrollTo?.({ top: Math.max(0, top), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const handleScroll = () => {
    const list = scroller.current;
    if (!list) return;
    nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
  };
  useEffect(() => {
    if (!live || !newestEvent || !nearBottom.current) return;
    const frame = requestAnimationFrame(scrollToNewest);
    return () => cancelAnimationFrame(frame);
  }, [live, newestEvent]);
  return <section className="flex h-full min-h-0 min-w-0 flex-col gap-3" aria-label="Перевірка розкладу">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <div>
        <h3 className="text-lg font-semibold tabular-nums">{preview.total} подій · {preview.days.length} дн.</h3>
        <p role="status" className="text-xs text-muted-foreground">{live ? 'Генерація триває' : preview.errors.length ? 'Потрібні уточнення' : 'Перевірено · готово до збереження'}</p>
      </div>
      {!live && <Button variant="outline" size="sm" onClick={() => onEditingChange(!editing)}><Pencil className="mr-2 size-3.5" />{editing ? 'Завершити редагування' : 'Редагувати'}</Button>}
      {live && <Button variant="ghost" size="sm" onClick={scrollToNewest} aria-label="До нової події"><ArrowDown className="size-4" /></Button>}
    </div>
    <div ref={scroller} onScroll={handleScroll} role="region" aria-label="Список подій" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
    {preview.errors.length > 0 && <div role="alert" className="space-y-2 text-sm text-destructive">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 shrink-0" />Виправте помилки перед збереженням</p>
      <ul className="list-disc space-y-1 break-words pl-5">{preview.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
    </div>}
    {preview.duplicates > 0 && <p className="text-xs text-muted-foreground">Повторів прибрано: {preview.duplicates}</p>}
    {preview.warnings.length > 0 && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Уточнення: {preview.warnings.length}</summary><ul className="list-disc space-y-1 break-words pl-5 pt-2">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    {preview.days.map((day) => <div key={day.date}>
      <h4 className="sticky top-0 z-10 border-b border-border bg-background py-3 text-sm font-semibold">{new Date(`${day.date}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', weekday: 'short' })}<span className="ml-2 font-normal text-muted-foreground">{day.items.length} подій</span></h4>
      <ol className="space-y-3 pt-3">{day.items.map((item, index) => {
        const key = `${day.date}|${scheduleImportKey(item)}`;
        const category = categories[item.category as keyof typeof categories] ?? categories.general;
        const Icon = category.icon;
        return <li ref={key === newestEvent ? newest : undefined} key={editing ? `${day.date}-${index}` : key} className={`rounded-lg border border-border border-l-[3px] bg-card p-3 ${category.accent} si-enter`}>
        {editing ? <div className="space-y-2">
          <Input aria-label={`Назва події ${index + 1}, ${day.date}`} value={item.title} onChange={(event) => onEdit(day.date, index, 'title', event.target.value)} />
          <div className="grid grid-cols-2 gap-2"><Input type="time" aria-label={`Початок події ${index + 1}, ${day.date}`} value={item.time_start} onChange={(event) => onEdit(day.date, index, 'time_start', event.target.value)} /><Input type="time" aria-label={`Кінець події ${index + 1}, ${day.date}`} value={item.time_end ?? ''} onChange={(event) => onEdit(day.date, index, 'time_end', event.target.value)} /></div>
        </div> : <div className="flex gap-3">
          <div className={`w-16 shrink-0 font-mono text-sm tabular-nums ${category.text}`}><p className="font-semibold">{item.time_start}</p>{item.time_end && <p className="text-xs text-muted-foreground">до {item.time_end}</p>}</div>
          <div className="min-w-0 flex-1"><span className={`mb-2 inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium ${category.text} ${category.surface}`}><Icon className="size-3" />{category.label}</span><p className="break-words text-sm font-semibold text-card-foreground">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.target_teams.length ? `Команди ${item.target_teams.join(', ')}` : 'Усі команди'}{item.sub_slots.length ? ` · Заїздів: ${item.sub_slots.length}` : ''}</p>{item.location && <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" />{item.location}</p>}{item.description && <p className="mt-2 break-words text-xs text-muted-foreground">{item.description}</p>}</div>
          {!live && <Check className="mt-1 size-3.5 shrink-0 text-muted-foreground" />}
        </div>}
      </li>; })}</ol>
    </div>)}
    </div>
  </section>;
}