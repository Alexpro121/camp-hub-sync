import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Plus, Minus, Loader2, CalendarDays, Eraser, ChevronLeft, ChevronRight, FileDown, Sparkles, MapPin, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAllTeams } from '@/hooks/useAllTeams';
import { CATEGORY_LIST, shiftTime, sentenceCase, normalizeTime, normalizeTimeRange } from '@/lib/scheduleCategories';
import { broadcastScheduleUpdated, dedupeItems, shiftISODate } from '@/lib/schedule';
import { useAutoTodayDate, localISO } from '@/hooks/useAutoTodayDate';
import type { Schedule, ScheduleItem, ScheduleSubSlot, Shift } from '@/types/app';
import { useActiveShift } from '@/context/ActiveShiftContext';
import AdminAiStudioImportModal from './AdminAiStudioImportModal';

const todayISO = () => localISO();

const WEEKDAYS = ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', "п'ятницю", 'суботу'];
const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const humanDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

interface Form {
  id: string | null;
  title: string;
  location: string;
  time_start: string;
  time_end: string;
  category: string;
  target_teams: number[];
}

const emptyForm = (): Form => ({ id: null, title: '', location: '', time_start: '', time_end: '', category: 'general', target_teams: [] });

const AdminScheduleEditor = () => {
  const TEAMS = useAllTeams();
  const { shiftId } = useActiveShift();
  const [date, setDate] = useState(todayISO());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Midnight rollover: yesterday → today, live and on app focus.
  useAutoTodayDate(date, setDate);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sch } = await supabase.from('schedules').select('*').eq('date', date).is('deleted_at', null);
    // Parallel shifts: only this shift's program (plus camp-wide rows) is editable here.
    const list = ((sch || []) as Schedule[]).filter((s) => !s.shift_id || !shiftId || s.shift_id === shiftId);
    setSchedules(list);
    const ids = list.map((s) => s.id);
    if (ids.length) {
      const { data } = await supabase.from('schedule_items').select('*').in('schedule_id', ids).order('time_start');
      setItems(dedupeItems((data || []) as unknown as ScheduleItem[]));
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [date, shiftId]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index),
    [items],
  );

  const hasDraft = schedules.some((s) => !s.is_published);

  /** Publish every draft batch of this date so children and staff can see it. */
  const publishDrafts = async () => {
    const hidden = schedules.filter((s) => !s.is_published).map((s) => s.id);
    if (!hidden.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('schedules').update({ is_published: true }).in('id', hidden);
      if (error) throw error;
      setSchedules((p) => p.map((s) => (hidden.includes(s.id) ? { ...s, is_published: true } : s)));
      await broadcastScheduleUpdated({ date, action: 'publish' });
      toast.success('Розклад опубліковано');
    } catch (e: any) {
      toast.error(e?.message || 'Помилка публікації');
    } finally {
      setBusy(false);
    }
  };

  /** Hide the day again (back to draft). */
  const unpublishAll = async () => {
    const shown = schedules.filter((s) => s.is_published).map((s) => s.id);
    if (!shown.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('schedules').update({ is_published: false }).in('id', shown);
      if (error) throw error;
      setSchedules((p) => p.map((s) => (shown.includes(s.id) ? { ...s, is_published: false } : s)));
      await broadcastScheduleUpdated({ date, action: 'unpublish' });
      toast.success('Розклад приховано (чернетка)');
    } catch (e: any) {
      toast.error(e?.message || 'Помилка');
    } finally {
      setBusy(false);
    }
  };

  /** Schedule row that receives new events for this date (created on demand). */
  const ensureSchedule = async (): Promise<string> => {
    const existing = schedules.find((s) => s.is_published) ?? schedules[0];
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from('schedules')
      .insert({ shift_id: shiftId, date, raw_text: null, is_published: true })
      .select()
      .single();
    if (error || !data) throw error;
    return data.id;
  };

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) { toast.error('Вкажи назву події'); return; }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        location: form.location.trim() || null,
        // Any input format is accepted: "14.25", "14:25", "1425", "14.25 - 14.56".
        time_start: normalizeTime(form.time_start) || null,
        time_end: normalizeTime(form.time_end) || null,
        category: form.category,
        target_teams: form.target_teams, // [] = for everyone
      };
      if (form.id) {
        const { error } = await supabase.from('schedule_items').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const scheduleId = await ensureSchedule();
        // Deduplication: same start time + title on this day → update instead of duplicating.
        const dup = sorted.find(
          (i) => (i.time_start || '') === (payload.time_start || '') &&
            (i.title || '').trim().toLowerCase() === payload.title.toLowerCase(),
        );
        if (dup) {
          const { error } = await supabase.from('schedule_items').update(payload).eq('id', dup.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('schedule_items').insert({
            ...payload,
            schedule_id: scheduleId,
            description: null,
            order_index: sorted.length,
            has_sub_slots: false,
            sub_slots: [] as unknown as any,
          });
          if (error) throw error;
        }
      }
      setForm(null);
      await load();
      await broadcastScheduleUpdated({ date, action: form.id ? 'update' : 'create' });
      toast.success('Розклад оновлено');
    } catch (e: any) {
      toast.error(e?.message || 'Помилка збереження');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('schedule_items').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await load();
    await broadcastScheduleUpdated({ date, action: 'delete' });
    toast.success('Подію видалено');
  };

  /** One-click wipe of the whole day: deletes all events and soft-deletes
   *  every schedule batch of this date (recoverable via deleted_at). */
  const wipeDay = async () => {
    setBusy(true);
    try {
      const ids = schedules.map((s) => s.id);
      if (ids.length) {
        const { error } = await supabase.from('schedule_items').delete().in('schedule_id', ids);
        if (error) throw error;
        const { error: e2 } = await supabase.from('schedules').update({ deleted_at: new Date().toISOString() }).in('id', ids);
        if (e2) throw e2;
      }
      setConfirmWipe(false);
      await load();
      await broadcastScheduleUpdated({ date, action: 'delete' });
      toast.success('Розклад на весь день видалено');
    } catch (e: any) {
      toast.error(e?.message || 'Помилка видалення');
    } finally {
      setBusy(false);
    }
  };

  /** Shift this event and every later event of the day by ±delta minutes,
   *  moving start, end AND every team sub-slot proportionally. */
  const shiftFrom = async (from: ScheduleItem, delta: number) => {
    const affected = sorted.filter((i) => (i.time_start || '') >= (from.time_start || ''));
    setBusy(true);
    try {
      for (const i of affected) {
        const slots = Array.isArray(i.sub_slots) ? (i.sub_slots as ScheduleSubSlot[]) : [];
        const nextSlots = slots.map((s) => ({ ...s, time: shiftTime(s.time, delta) ?? s.time }));
        const { error } = await supabase
          .from('schedule_items')
          .update({
            time_start: shiftTime(i.time_start, delta),
            time_end: shiftTime(i.time_end, delta),
            sub_slots: nextSlots as unknown as any,
          })
          .eq('id', i.id);
        if (error) throw error;
      }
      await load();
      await broadcastScheduleUpdated({ date, action: 'shift', delta });
      toast.success(`Зсув ${delta > 0 ? '+' : ''}${delta} хв для ${affected.length} подій`);
    } catch (e: any) {
      toast.error(e?.message || 'Помилка зсуву');
    } finally {
      setBusy(false);
    }
  };

  /** Remove events that repeat the same start time + title on this date. */
  const cleanDuplicates = async () => {
    setBusy(true);
    try {
      const seen = new Set<string>();
      const trash: string[] = [];
      for (const i of sorted) {
        const key = `${(i.time_start || '').trim()}|${(i.title || '').trim().toLowerCase()}`;
        if (seen.has(key)) trash.push(i.id);
        else seen.add(key);
      }
      if (!trash.length) { toast.success('Дублікатів не знайдено'); return; }
      const { error } = await supabase.from('schedule_items').delete().in('id', trash);
      if (error) throw error;
      await load();
      await broadcastScheduleUpdated({ date, action: 'dedupe' });
      toast.success(`Видалено дублікатів: ${trash.length}`);
    } catch (e: any) {
      toast.error(e?.message || 'Помилка очищення');
    } finally {
      setBusy(false);
    }
  };

  const toggleTeam = (t: number) =>
    setForm((p) => p && ({
      ...p,
      target_teams: p.target_teams.includes(t)
        ? p.target_teams.filter((x) => x !== t)
        : [...p.target_teams, t].sort((a, b) => a - b),
    }));

  return (
    <Card className="p-4 bg-gradient-card space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-primary" strokeWidth={1.75} />
        <h3 className="font-bold uppercase text-sm tracking-wide">Редактор дня</h3>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[150px] text-xs ml-auto" />
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-9 flex-1 text-[11px]" onClick={() => setDate(shiftISODate(date, -1))}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Попередній
        </Button>
        <Button
          size="sm"
          variant={date === todayISO() ? 'default' : 'secondary'}
          className="h-9 flex-1 text-[11px] font-bold uppercase"
          onClick={() => setDate(todayISO())}
        >
          <CalendarDays className="w-4 h-4 mr-1" /> Сьогодні
        </Button>
        <Button variant="outline" size="sm" className="h-9 flex-1 text-[11px]" onClick={() => setDate(shiftISODate(date, 1))}>
          Наступний <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {schedules.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Об’єднано {schedules.length} розкладів цієї дати в одну часову лінію.
        </p>
      )}

      {schedules.length > 0 && (
        <div className={`rounded-xl border p-3 space-y-2 ${hasDraft ? 'border-amber-400/40 bg-amber-400/10' : 'border-border/60 bg-surface-1'}`}>
          <div className="flex items-center gap-2">
            {hasDraft ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-primary" />}
            <p className="text-[11px] font-semibold">
              {hasDraft
                ? 'Чернетка — діти й супровід поки не бачать цей розклад.'
                : 'Розклад опубліковано і видимий для всіх.'}
            </p>
          </div>
          {hasDraft ? (
            <Button disabled={busy} onClick={publishDrafts} className="w-full h-10 text-xs font-bold uppercase">
              <Eye className="w-4 h-4 mr-1.5" /> Опублікувати розклад
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={unpublishAll} className="w-full h-10 text-xs font-bold uppercase">
              <EyeOff className="w-4 h-4 mr-1.5" /> Повернути в чернетку
            </Button>
          )}
        </div>
      )}

      <Button onClick={() => setForm(emptyForm())} className="w-full h-10 text-xs font-bold uppercase">
        <Plus className="w-4 h-4 mr-1.5" /> Додати подію
      </Button>

      <Button
        variant="secondary"
        onClick={() => setAiOpen(true)}
        className="w-full h-10 text-xs font-bold uppercase"
      >
        <Sparkles className="w-4 h-4 mr-1.5" /> Імпорт через AI Studio (JSON)
      </Button>

      <Button
        variant="outline"
        disabled={busy || !sorted.length}
        onClick={cleanDuplicates}
        className="w-full h-10 text-xs font-bold uppercase"
      >
        <Eraser className="w-4 h-4 mr-1.5" /> Очистити дублікати розкладу
      </Button>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-surface-1 p-5 text-center space-y-3">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="text-sm font-semibold">На {humanDate(date)} розклад ще не створено.</p>
          <div className="space-y-2">
            <Button className="w-full h-11 text-xs font-bold uppercase" onClick={() => setAiOpen(true)}>
              <FileDown className="w-4 h-4 mr-1.5" /> Імпорт розкладу через AI Studio
            </Button>
            <Button variant="outline" className="w-full h-11 text-xs font-bold uppercase" onClick={() => setForm(emptyForm())}>
              <Plus className="w-4 h-4 mr-1.5" /> Додати першу подію вручну
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {sorted.map((i) => (
            <div key={i.id} className="rounded-xl border border-border/50 bg-surface-1 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground shrink-0">
                  {i.time_start || '--:--'} – {i.time_end || '--:--'}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{sentenceCase(i.title)}</p>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setForm({
                  id: i.id,
                  title: i.title,
                  location: i.location || '',
                  time_start: i.time_start || '',
                  time_end: i.time_end || '',
                  category: i.category || 'general',
                  target_teams: i.target_teams || [],
                })}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => remove(i.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {i.target_teams?.length ? `Команди ${i.target_teams.join(', ')}` : 'Для всіх'}
                </span>
                <Button size="sm" variant="secondary" disabled={busy} className="h-7 px-2 text-[10px] ml-auto" onClick={() => shiftFrom(i, -15)}>
                  <Minus className="w-3 h-3 mr-1" />15 хв
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} className="h-7 px-2 text-[10px]" onClick={() => shiftFrom(i, 15)}>
                  <Plus className="w-3 h-3 mr-1" />15 хв
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{form?.id ? 'Редагувати подію' : 'Нова подія'}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Назва</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Сніданок" className="h-10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Локація (необов’язково)
                </Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Велика зала" className="h-10 text-sm" />
              </div>
              <div className="flex gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Початок</Label>
                  <Input
                    value={form.time_start}
                    onChange={(e) => setForm({ ...form, time_start: e.target.value })}
                    onBlur={(e) => {
                      const { start, end } = normalizeTimeRange(e.target.value);
                      setForm((p) => p && { ...p, time_start: start ?? p.time_start, time_end: end ?? p.time_end });
                    }}
                    placeholder="18:00 або 18.00"
                    className="h-10 w-[96px] text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Кінець</Label>
                  <Input
                    value={form.time_end}
                    onChange={(e) => setForm({ ...form, time_end: e.target.value })}
                    onBlur={(e) => setForm((p) => p && { ...p, time_end: normalizeTime(e.target.value) ?? p.time_end })}
                    placeholder="19:00 або 19.00"
                    className="h-10 w-[96px] text-sm tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Категорія</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_LIST.map((c) => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Команди {form.target_teams.length === 0 && '(порожньо = всі)'}
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {TEAMS.map((t) => {
                    const on = form.target_teams.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTeam(t)}
                        className={`h-8 w-8 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                          on ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border'
                        }`}
                      >{t}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={save} disabled={busy} className="w-full h-11 font-bold uppercase text-xs">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Зберегти'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAiStudioImportModal open={aiOpen} date={date} onOpenChange={setAiOpen} onImported={load} />
    </Card>
  );
};

export default AdminScheduleEditor;