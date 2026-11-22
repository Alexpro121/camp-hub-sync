import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormSheet from '@/components/ui/form-sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_LIST, maskTimeInput, normalizeTime, normalizeTimeRange, sentenceCase } from '@/lib/scheduleCategories';
import { broadcastScheduleUpdated } from '@/lib/schedule';
import { audiencePayload, sameAudience, visibleToShift } from '@/lib/scheduleAudience';
import { findOverlaps } from '@/lib/scheduleOverlap';
import type { Schedule, ScheduleItem } from '@/types/app';
import { teamLabelFor } from '@/lib/teamLabel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: number;
  /** Зміна супроводу: подія потрапляє в опублікований розклад цієї зміни. */
  shiftId: string | null;
  date: string;
  /** Власна подія для редагування; без неї — нова. */
  item?: ScheduleItem | null;
  onSaved: (date: string) => void;
}

/**
 * Подія супроводу для своєї команди. Права перевіряє база:
 * лише своя команда, лише свої події, лише опублікований розклад.
 */
const TeamEventDialog = ({ open, onOpenChange, team, shiftId, date, item, onSaved }: Props) => {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(date);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState('general');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Накладки, про які вже попередили; повторне «Зберегти» їх приймає. */
  const [overlaps, setOverlaps] = useState<ScheduleItem[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? '');
    setDay(date);
    setStart(item?.time_start ?? '');
    setEnd(item?.time_end ?? '');
    setLocation(item?.location ?? '');
    setDetails(item?.description ?? '');
    setCategory(item?.category || 'general');
    setConfirmDelete(false);
    setOverlaps(null);
  }, [open, item, date]);
  // Змінили день чи час — перевіряємо накладки заново.
  useEffect(() => { setOverlaps(null); }, [day, start, end]);

  /** Події дня, які бачить команда, що перетинаються з новим часом. */
  const dayOverlaps = async (forDate: string, timeStart: string, timeEnd: string | null): Promise<ScheduleItem[]> => {
    const { data: sch, error } = await supabase.from('schedules').select('*').eq('date', forDate).eq('is_published', true).is('deleted_at', null);
    if (error) throw error;
    const ids = ((sch || []) as Schedule[]).filter((s) => visibleToShift(s, shiftId)).map((s) => s.id);
    if (!ids.length) return [];
    const { data: rows, error: itemsError } = await supabase.from('schedule_items').select('*').in('schedule_id', ids);
    if (itemsError) throw itemsError;
    return findOverlaps({ time_start: timeStart, time_end: timeEnd }, (rows || []) as unknown as ScheduleItem[], team, item?.id);
  };


  /** Опублікований розклад зміни на дату (створюється, якщо його ще немає). */
  const publishedSchedule = async (forDate: string): Promise<string> => {
    const ids = shiftId ? [shiftId] : [];
    const { data, error } = await supabase.from('schedules').select('*').eq('date', forDate).eq('is_published', true).is('deleted_at', null);
    if (error) throw error;
    const own = ((data || []) as Schedule[]).find((s) => sameAudience(s, ids));
    if (own) return own.id;
    const created = await supabase.from('schedules').insert({ ...audiencePayload(ids), date: forDate, raw_text: null, is_published: true }).select('id').single();
    if (created.error || !created.data) throw created.error ?? new Error('Не вдалося створити розклад');
    return created.data.id;
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Вкажіть назву події'); return; }
    const range = normalizeTimeRange(start);
    const finish = end.trim() ? normalizeTime(end) : range.end;
    if (!range.start) { toast.error('Вкажіть час початку у форматі ГГ:ХХ'); return; }
    if (end.trim() && !finish) { toast.error('Вкажіть час кінця у форматі ГГ:ХХ'); return; }
    if (finish === range.start) { toast.error('Початок і кінець не можуть збігатися'); return; }
    setBusy(true);
    try {
      // Накладки дозволені, але спершу попереджаємо супровід.
      if (overlaps === null) {
        const found = await dayOverlaps(item ? date : day, range.start, finish);
        if (found.length) { setOverlaps(found); return; }
      }
      const payload = {
        title: title.trim(),
        time_start: range.start,
        time_end: finish,
        location: location.trim() || null,
        description: details.trim() || null,
        category,
        target_teams: [team],
      };
      if (item) {
        const { error } = await supabase.from('schedule_items').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const scheduleId = await publishedSchedule(day);
        const { error } = await supabase.from('schedule_items').insert({
          ...payload, schedule_id: scheduleId, order_index: 1000, has_sub_slots: false, sub_slots: [] as unknown as never,
        });
        if (error) throw error;
      }
      await broadcastScheduleUpdated({ date: day, action: item ? 'update' : 'create' });
      toast.success(item ? 'Подію оновлено' : `Подію додано для команди №${teamLabelFor(team, shiftId)}`);
      onOpenChange(false);
      onSaved(day);
    } catch (e: any) {
      toast.error(/row-level security|permission/i.test(e?.message ?? '')
        ? 'Немає прав: супровід може змінювати лише власні події своєї команди'
        : e?.message || 'Не вдалося зберегти подію');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('schedule_items').delete().eq('id', item.id);
      if (error) throw error;
      await broadcastScheduleUpdated({ date: day, action: 'delete' });
      toast.success('Подію видалено');
      onOpenChange(false);
      onSaved(day);
    } catch (e: any) {
      toast.error(e?.message || 'Не вдалося видалити подію');
    } finally {
      setBusy(false);
    }
  };

  const field = 'h-11 text-sm';
  const label = 'text-[10px] uppercase tracking-wider text-muted-foreground';
  const dirty = open && (
    title !== (item?.title ?? '') || start !== (item?.time_start ?? '') || end !== (item?.time_end ?? '')
    || location !== (item?.location ?? '') || details !== (item?.description ?? '')
  );

  const footer = (
    <div className="space-y-2.5">
      {/* Попередження в нижній панелі — видно разом із кнопкою, навіть з відкритою клавіатурою. */}
      {overlaps && overlaps.length > 0 && (
        <div role="alert" className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
          <p className="flex items-center gap-1.5 font-semibold text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Накладка з {overlaps.length === 1 ? 'подією' : `${overlaps.length} подіями`} команди
          </p>
          <ul className="space-y-0.5">
            {overlaps.slice(0, 5).map((o) => (
              <li key={o.id} className="truncate">
                <span className="font-mono tabular-nums">{o.time_start}{o.time_end ? `–${o.time_end}` : ''}</span> · {sentenceCase(o.title)}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">Можна зберегти — команда побачить обидві події одночасно.</p>
        </div>
      )}
      <div className="flex gap-2">
        {item && (
          <Button type="button" variant="outline" onClick={remove} disabled={busy}
            className={`h-12 ${confirmDelete ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-destructive/40 text-destructive'}`}>
            <Trash2 className="mr-1.5 h-4 w-4" />{confirmDelete ? 'Так, видалити' : 'Видалити'}
          </Button>
        )}
        <Button type="button" onClick={save} disabled={busy} className="h-12 flex-1 font-bold">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : overlaps?.length ? 'Все одно зберегти' : 'Зберегти'}
        </Button>
      </div>
    </div>
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      dirty={dirty}
      title={item ? 'Моя подія' : `Подія для команди №${teamLabelFor(team, shiftId)}`}
      description="Бачать лише учасники та супровід вашої команди."
      footer={footer}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="team-ev-title" className={label}>Назва</Label>
          <Input id="team-ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Збір команди" maxLength={120}
            enterKeyHint="next" autoCapitalize="sentences" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="team-ev-start" className={label}>Початок</Label>
            <Input id="team-ev-start" value={start} inputMode="numeric" enterKeyHint="next" autoComplete="off" placeholder="1800"
              onChange={(e) => setStart(maskTimeInput(e.target.value))}
              onBlur={(e) => { const r = normalizeTimeRange(e.target.value); if (r.start) setStart(r.start); if (r.end) setEnd(r.end); }}
              className={`${field} tabular-nums`} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="team-ev-end" className={label}>Кінець</Label>
            <Input id="team-ev-end" value={end} inputMode="numeric" enterKeyHint="next" autoComplete="off" placeholder="1900"
              onChange={(e) => setEnd(maskTimeInput(e.target.value))}
              onBlur={(e) => setEnd(normalizeTime(e.target.value) ?? e.target.value)} className={`${field} tabular-nums`} />
          </div>
        </div>
        {!item && (
          <div className="space-y-1.5">
            <Label htmlFor="team-ev-day" className={label}>День</Label>
            <Input id="team-ev-day" type="date" value={day} onChange={(e) => setDay(e.target.value || date)} className={field} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="team-ev-place" className={`${label} flex items-center gap-1`}><MapPin className="h-3 w-3" /> Місце</Label>
          <Input id="team-ev-place" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Біля корпусу 2" maxLength={120}
            enterKeyHint="next" className={field} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="team-ev-details" className={label}>Деталі</Label>
          <textarea id="team-ev-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={500} placeholder="Взяти воду, форма спортивна…"
            enterKeyHint="done" className="w-full resize-none rounded-md border border-input bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <Label className={label}>Категорія</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-11 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_LIST.map((c) => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormSheet>
  );
};

export default TeamEventDialog;
