import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Plus, Minus, Loader2, CalendarDays, Eraser, ChevronLeft, ChevronRight, FileDown, Sparkles, MapPin, Eye, EyeOff, Copy, Check, X, Layers, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAllTeams } from '@/hooks/useAllTeams';
import { CATEGORY_LIST, shiftTime, sentenceCase, normalizeTime, normalizeTimeRange } from '@/lib/scheduleCategories';
import { broadcastScheduleUpdated, dedupeItems, shiftISODate } from '@/lib/schedule';
import { useAutoTodayDate, localISO } from '@/hooks/useAutoTodayDate';
import type { Schedule, ScheduleItem, ScheduleSubSlot, Shift } from '@/types/app';
import { useActiveShift } from '@/context/ActiveShiftContext';
import AdminAiStudioImportModal from './AdminAiStudioImportModal';
import { scheduleImportKey } from '@/lib/scheduleImport';
import { audienceOf, audiencePayload, sameAudience, touchesShifts } from '@/lib/scheduleAudience';

const todayISO = () => localISO();

const WEEKDAYS = ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', "п'ятницю", 'суботу'];
const SHORT_WD = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const humanDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${SHORT_WD[d.getDay()]} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const SCOPE_KEY = 'ironshift:schedule-scope';
const readScope = (): string[] => { try { const v = JSON.parse(localStorage.getItem(SCOPE_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const writeScope = (ids: string[]) => { try { localStorage.setItem(SCOPE_KEY, JSON.stringify(ids)); } catch { /* private mode */ } };

interface Form {
  id: string | null;
  title: string;
  location: string;
  time_start: string;
  time_end: string;
  category: string;
  target_teams: number[];
  /** Зміни, яким належить подія (спільний розклад, якщо кілька). */
  shifts: string[];
  /** Зміни події до редагування: переносимо подію, лише якщо їх справді змінили. */
  origShifts: string[];
  /** Додаткові дати для нової події («Повтор»). */
  repeat: string[];
}

type Row = ScheduleItem & { audience: string[] | null };

const AdminScheduleEditor = () => {
  const { shiftId, shifts: allShifts } = useActiveShift();
  const { byShift } = useAllTeams();
  const [date, setDate] = useState(todayISO());
  const [scope, setScopeState] = useState<string[]>(() => readScope());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [quick, setQuick] = useState<{ id: string; start: string; end: string } | null>(null);
  const loadVersion = useRef(0);

  useAutoTodayDate(date, setDate);

  // Зміни, які ще тривають або попереду (+ уже обрані), — серед них і вибираємо.
  const shiftOptions = useMemo(() => {
    const t = todayISO();
    return allShifts
      .filter((s) => !s.deleted_at && (s.end_date >= t || scope.includes(s.id) || s.id === shiftId))
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [allShifts, scope, shiftId]);
  const shiftById = useMemo(() => new Map(allShifts.map((s) => [s.id, s])), [allShifts]);

  // Невідомі/видалені зміни прибираємо; порожній вибір — активна зміна.
  const activeScope = useMemo(() => {
    const known = scope.filter((id) => shiftById.has(id));
    return known.length ? known : shiftId ? [shiftId] : [];
  }, [scope, shiftById, shiftId]);
  const scopeKey = activeScope.join(',');
  const setScope = (ids: string[]) => { setScopeState(ids); writeScope(ids); };
  const toggleScope = (id: string) => {
    const next = activeScope.includes(id) ? activeScope.filter((x) => x !== id) : [...activeScope, id];
    if (next.length) setScope(next);
  };

  const shiftName = (id: string) => shiftById.get(id)?.name ?? 'зміна';
  const audienceLabel = (aud: string[] | null) => (aud === null ? 'Увесь табір' : aud.map(shiftName).join(' + '));
  const teamsOf = useCallback((ids: string[]) => [...new Set(ids.flatMap((id) => byShift[id] ?? []))].sort((a, b) => a - b), [byShift]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const { data: sch, error: scheduleError } = await supabase.from('schedules').select('*').eq('date', date).is('deleted_at', null);
      if (scheduleError) throw scheduleError;
      if (version !== loadVersion.current) return;
      const scopeIds = scopeKey ? scopeKey.split(',') : [];
      const list = ((sch || []) as Schedule[]).filter((s) => touchesShifts(s, scopeIds));
      setSchedules(list);
      const ids = list.map((s) => s.id);
      if (ids.length) {
        const { data, error } = await supabase.from('schedule_items').select('*').in('schedule_id', ids).order('time_start');
        if (error) throw error;
        if (version !== loadVersion.current) return;
        const aud = new Map(list.map((s) => [s.id, audienceOf(s)]));
        setItems(dedupeItems((data || []) as unknown as ScheduleItem[]).map((i) => ({ ...i, audience: aud.get(i.schedule_id) ?? null })));
      } else {
        setItems([]);
      }
    } catch (error: unknown) {
      if (version === loadVersion.current) {
        setSchedules([]);
        setItems([]);
        toast.error(error instanceof Error ? error.message : 'Не вдалося завантажити розклад');
      }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [date, scopeKey]);

  useEffect(() => { void load(); return () => { loadVersion.current++; }; }, [load]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '') || a.order_index - b.order_index),
    [items],
  );
  const multi = activeScope.length > 1 || items.some((i) => !i.audience || i.audience.join(',') !== scopeKey);
  /** Розклади, які повністю належать обраним змінам: їх можна масово змінювати без впливу на інші зміни. */
  const ownedOnly = (aud: string[] | null) => aud !== null && aud.every((id) => activeScope.includes(id));

  const hasDraft = schedules.some((s) => !s.is_published);

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

  const unpublishAll = async () => {
    const shown = schedules.filter((s) => s.is_published && ownedOnly(audienceOf(s))).map((s) => s.id);
    if (!shown.length) { toast.info('Тут лише спільні розклади інших змін — їх приховують з тих змін'); return; }
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

  /** Пакет розкладу для дати й набору змін (створюється за потреби). */
  const ensureSchedule = async (forDate: string, shiftIds: string[]): Promise<string> => {
    const local = forDate === date ? schedules.filter((s) => sameAudience(s, shiftIds)) : [];
    let pool = local;
    if (forDate !== date) {
      const { data, error } = await supabase.from('schedules').select('*').eq('date', forDate).is('deleted_at', null);
      if (error) throw error;
      pool = ((data || []) as Schedule[]).filter((s) => sameAudience(s, shiftIds));
    }
    const existing = pool.find((s) => s.is_published) ?? pool[0];
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from('schedules')
      .insert({ ...audiencePayload(shiftIds), date: forDate, raw_text: null, is_published: true })
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Не вдалося створити розклад');
    if (forDate === date) setSchedules((p) => [...p, data as Schedule]);
    return data.id;
  };

  const newForm = (base?: Partial<Form>): Form => ({
    id: null, title: '', location: '', time_start: '', time_end: '', category: 'general', target_teams: [],
    shifts: activeScope, origShifts: activeScope, repeat: [], ...base,
  });

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) { toast.error('Вкажи назву події'); return; }
    if (!form.time_start?.trim()) { toast.error('Вкажи час початку — без нього подія не з’явиться в розкладі'); return; }
    if (!form.shifts.length) { toast.error('Обери хоча б одну зміну'); return; }
    const range = normalizeTimeRange(form.time_start);
    const end = form.time_end.trim() ? normalizeTime(form.time_end) : range.end;
    if (!range.start || (form.time_end.trim() && !end)) { toast.error('Вкажіть коректний час у форматі ГГ:ХХ'); return; }
    if (end === range.start) { toast.error('Початок і кінець не можуть збігатися'); return; }
    // Команди лише з обраних змін: інакше подія «зависне» для команди, якої в розкладі немає.
    const allowed = new Set(teamsOf(form.shifts));
    const teams = form.target_teams.filter((t) => allowed.has(t));
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        location: form.location.trim() || null,
        time_start: range.start,
        time_end: end,
        category: form.category,
        target_teams: teams, // [] = усі команди обраних змін
      };
      if (form.id) {
        const moved = !sameAudience({ shift_id: null, shift_ids: form.origShifts }, form.shifts);
        const schedule_id = moved ? await ensureSchedule(date, form.shifts) : undefined;
        const { error } = await supabase.from('schedule_items').update({ ...payload, ...(schedule_id ? { schedule_id } : {}) }).eq('id', form.id);
        if (error) throw error;
      } else {
        const dates = [date, ...form.repeat.filter((d) => d !== date)];
        let created = 0, updated = 0;
        for (const d of dates) {
          const scheduleId = await ensureSchedule(d, form.shifts);
          // Та сама подія (час + назва + місце + команди) у цьому пакеті — оновлюємо, а не дублюємо.
          const { data: same, error: readError } = await supabase.from('schedule_items')
            .select('id, title, time_start, location, target_teams').eq('schedule_id', scheduleId);
          if (readError) throw readError;
          const dup = (same ?? []).find((i) => scheduleImportKey(i) === scheduleImportKey(payload));
          if (dup) {
            const { error } = await supabase.from('schedule_items').update(payload).eq('id', dup.id);
            if (error) throw error;
            updated++;
          } else {
            const { error } = await supabase.from('schedule_items').insert({
              ...payload,
              schedule_id: scheduleId,
              description: null,
              order_index: (same ?? []).length,
              has_sub_slots: false,
              sub_slots: [] as unknown as any,
            });
            if (error) throw error;
            created++;
          }
        }
        if (dates.length > 1) toast.success(`Подію додано на ${created} дн.${updated ? `, оновлено ${updated}` : ''}`);
      }
      setForm(null);
      await load();
      await broadcastScheduleUpdated({ date, action: form.id ? 'update' : 'create' });
      if (form.id || !form.repeat.length) toast.success('Розклад оновлено');
    } catch (e: any) {
      toast.error(e?.message || 'Помилка збереження');
    } finally {
      setBusy(false);
    }
  };

  /** Швидка зміна часу прямо в списку. */
  const saveQuick = async () => {
    if (!quick) return;
    const range = normalizeTimeRange(quick.start);
    const end = quick.end.trim() ? normalizeTime(quick.end) : range.end;
    if (!range.start || (quick.end.trim() && !end) || end === range.start) { toast.error('Вкажіть коректний час у форматі ГГ:ХХ'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('schedule_items').update({ time_start: range.start, time_end: end }).eq('id', quick.id);
      if (error) throw error;
      setQuick(null);
      await load();
      await broadcastScheduleUpdated({ date, action: 'update' });
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

  // Спільні розклади з іншими змінами й загальнотаборові масово не чіпаємо.
  const wipeTargets = schedules.filter((s) => ownedOnly(audienceOf(s)));
  const wipeItems = sorted.filter((i) => ownedOnly(i.audience));

  const wipeDay = async () => {
    setBusy(true);
    try {
      const ids = wipeTargets.map((s) => s.id);
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

  /** Зсув цієї й усіх пізніших подій дня (лише в розкладах обраних змін). */
  const shiftFrom = async (from: Row, delta: number) => {
    const affected = sorted.filter((i) => (i.time_start || '') >= (from.time_start || '') && (i.id === from.id || ownedOnly(i.audience)));
    setBusy(true);
    try {
      const payload = affected.map((i) => {
        const slots = Array.isArray(i.sub_slots) ? (i.sub_slots as ScheduleSubSlot[]) : [];
        return {
          id: i.id,
          time_start: shiftTime(i.time_start, delta),
          time_end: shiftTime(i.time_end, delta),
          sub_slots: slots.map((s) => ({ ...s, time: shiftTime(s.time, delta) ?? s.time })),
        };
      });
      const { error } = await (supabase as any).rpc('shift_schedule_items', { p_items: payload });
      if (error) throw error;
      await load();
      await broadcastScheduleUpdated({ date, action: 'shift', delta });
      toast.success(`Зсув ${delta > 0 ? '+' : ''}${delta} хв для ${affected.length} подій`);
    } catch (e: any) {
      toast.error(e?.message || 'Помилка зсуву');
    } finally {
      setBusy(false);
    }
  };

  const cleanDuplicates = async () => {
    setBusy(true);
    try {
      const seen = new Set<string>();
      const trash: string[] = [];
      for (const i of sorted) {
        const teamsKey = (Array.isArray(i.target_teams) ? [...(i.target_teams as any[])] : []).map(String).sort().join(',');
        const key = `${(i.audience ?? []).join(',')}|${(i.time_start || '').trim()}|${(i.title || '').trim().toLowerCase()}|${(i.location || '').trim().toLowerCase()}|${teamsKey}`;
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
      target_teams: p.target_teams.includes(t) ? p.target_teams.filter((x) => x !== t) : [...p.target_teams, t].sort((a, b) => a - b),
    }));
  const toggleShiftTeams = (id: string) =>
    setForm((p) => {
      if (!p) return p;
      const teams = byShift[id] ?? [];
      const all = teams.length > 0 && teams.every((t) => p.target_teams.includes(t));
      const next = all ? p.target_teams.filter((t) => !teams.includes(t)) : [...new Set([...p.target_teams, ...teams])];
      return { ...p, target_teams: next.sort((a, b) => a - b) };
    });
  const toggleFormShift = (id: string) =>
    setForm((p) => {
      if (!p) return p;
      const shifts = p.shifts.includes(id) ? p.shifts.filter((x) => x !== id) : [...p.shifts, id];
      const allowed = new Set(teamsOf(shifts));
      return { ...p, shifts, target_teams: p.target_teams.filter((t) => allowed.has(t)) };
    });

  // Дні для повтору — у межах обраних змін (не більше 45).
  const repeatDays = useMemo(() => {
    if (!form || form.id) return [];
    const ss = form.shifts.map((id) => shiftById.get(id)).filter(Boolean) as Shift[];
    if (!ss.length) return [];
    const from = ss.reduce((m, s) => (s.start_date < m ? s.start_date : m), ss[0].start_date);
    const to = ss.reduce((m, s) => (s.end_date > m ? s.end_date : m), ss[0].end_date);
    const out: string[] = [];
    for (let d = from; d <= to && out.length < 45; d = shiftISODate(d, 1)) if (d !== date) out.push(d);
    return out;
  }, [form, shiftById, date]);

  const editFrom = (i: Row, asCopy = false): Form => {
    // Загальнотаборова подія: показуємо всі зміни, але без зміни чипів подія лишається загальною.
    const shifts = i.audience ?? shiftOptions.map((s) => s.id);
    return newForm({
    id: asCopy ? null : i.id,
    title: i.title,
    location: i.location || '',
    time_start: i.time_start || '',
    time_end: i.time_end || '',
    category: i.category || 'general',
    target_teams: (i.target_teams as number[]) || [],
    shifts,
    origShifts: shifts,
  });
  };

  const chip = (on: boolean) => `h-8 rounded-lg border px-2.5 text-xs font-semibold transition-all active:scale-95 ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border'}`;
  const formTeams = form ? teamsOf(form.shifts) : [];

  return (
    <Card className="min-w-0 space-y-3 overflow-hidden bg-gradient-card p-3 sm:p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:flex">
        <CalendarDays className="w-4 h-4 text-primary" strokeWidth={1.75} />
        <h3 className="font-bold uppercase text-sm tracking-wide">Редактор дня</h3>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="col-span-2 h-10 w-full text-xs sm:col-span-1 sm:ml-auto sm:w-[150px]" />
      </div>

      {/* Для яких змін складаємо розклад */}
      {shiftOptions.length > 1 && (
        <div className="space-y-1.5 rounded-xl border border-border/60 bg-surface-1 p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Розклад для змін
          </p>
          <div className="flex flex-wrap gap-1.5">
            {shiftOptions.map((s) => {
              const teams = byShift[s.id] ?? [];
              return (
                <button key={s.id} type="button" onClick={() => toggleScope(s.id)} className={chip(activeScope.includes(s.id))}>
                  {s.name}{teams.length ? <span className="ml-1 font-normal opacity-75">· {teams[0]}{teams.length > 1 ? `–${teams[teams.length - 1]}` : ''}</span> : null}
                </button>
              );
            })}
            {shiftOptions.length > 1 && activeScope.length < shiftOptions.length && (
              <button type="button" onClick={() => setScope(shiftOptions.map((s) => s.id))} className="h-8 rounded-lg px-2 text-xs text-primary">Усі</button>
            )}
          </div>
          {activeScope.length > 1 && (
            <p className="text-[11px] text-muted-foreground">Нові події — один спільний розклад: зміни в часі одразу видно в усіх обраних змінах.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 items-center gap-1.5 sm:gap-2">
        <Button aria-label="Попередній день" variant="outline" size="sm" className="h-10 min-w-0 px-1 text-[10px] sm:text-[11px]" onClick={() => setDate(shiftISODate(date, -1))}>
          <ChevronLeft className="size-4 shrink-0 sm:mr-1" /> <span className="hidden min-[390px]:inline">Попередній</span>
        </Button>
        <Button size="sm" variant={date === todayISO() ? 'default' : 'secondary'} className="h-10 min-w-0 px-1 text-[10px] font-bold uppercase sm:text-[11px]" onClick={() => setDate(todayISO())}>
          <CalendarDays className="size-4 shrink-0 min-[390px]:mr-1" /> Сьогодні
        </Button>
        <Button aria-label="Наступний день" variant="outline" size="sm" className="h-10 min-w-0 px-1 text-[10px] sm:text-[11px]" onClick={() => setDate(shiftISODate(date, 1))}>
          <span className="hidden min-[390px]:inline">Наступний</span> <ChevronRight className="size-4 shrink-0 min-[390px]:ml-1" />
        </Button>
      </div>

      {schedules.length > 0 && (
        <div className={`rounded-xl border p-3 space-y-2 ${hasDraft ? 'border-amber-400/40 bg-amber-400/10' : 'border-border/60 bg-surface-1'}`}>
          <div className="flex items-center gap-2">
            {hasDraft ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-primary" />}
            <p className="text-[11px] font-semibold">
              {hasDraft ? 'Чернетка — діти й супровід поки не бачать цей розклад.' : 'Розклад опубліковано і видимий для всіх.'}
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

      <Button onClick={() => setForm(newForm())} disabled={!activeScope.length} className="w-full h-10 text-xs font-bold uppercase">
        <Plus className="w-4 h-4 mr-1.5" /> Додати подію
      </Button>
      <Button variant="secondary" onClick={() => setAiOpen(true)} className="w-full h-10 text-xs font-bold uppercase">
        <Sparkles className="w-4 h-4 mr-1.5" /> Імпорт розкладу з Gemini
      </Button>
      <Button variant="outline" disabled={busy || !sorted.length} onClick={cleanDuplicates} className="w-full h-10 text-xs font-bold uppercase">
        <Eraser className="w-4 h-4 mr-1.5" /> Очистити дублікати розкладу
      </Button>
      <Button
        variant="outline"
        disabled={busy || !wipeTargets.length}
        onClick={() => setConfirmWipe(true)}
        className="w-full h-10 text-xs font-bold uppercase border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="w-4 h-4 mr-1.5" /> Видалити розклад на весь день
      </Button>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-surface-1 p-5 text-center space-y-3">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
          <p className="text-sm font-semibold">На {humanDate(date)} розклад ще не створено.</p>
          <div className="space-y-2">
            <Button className="w-full h-11 text-xs font-bold uppercase" onClick={() => setAiOpen(true)}>
              <FileDown className="w-4 h-4 mr-1.5" /> Імпорт розкладу з Gemini
            </Button>
            <Button variant="outline" className="w-full h-11 text-xs font-bold uppercase" onClick={() => setForm(newForm())} disabled={!activeScope.length}>
              <Plus className="w-4 h-4 mr-1.5" /> Додати першу подію вручну
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {sorted.map((i) => (
            <div key={i.id} className="rounded-xl border border-border/50 bg-surface-1 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                {quick?.id === i.id ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); void saveQuick(); }}>
                    <Input autoFocus value={quick.start} onChange={(e) => setQuick({ ...quick, start: e.target.value })} aria-label="Початок" className="h-8 w-[4.5rem] px-2 text-xs tabular-nums"
                      onKeyDown={(e) => e.key === 'Escape' && setQuick(null)} />
                    <span className="text-muted-foreground">–</span>
                    <Input value={quick.end} onChange={(e) => setQuick({ ...quick, end: e.target.value })} aria-label="Кінець" className="h-8 w-[4.5rem] px-2 text-xs tabular-nums"
                      onKeyDown={(e) => e.key === 'Escape' && setQuick(null)} />
                    <Button type="submit" size="icon" variant="ghost" disabled={busy} className="h-8 w-8 shrink-0" aria-label="Зберегти час"><Check className="h-4 w-4 text-success" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Скасувати" onClick={() => setQuick(null)}><X className="h-4 w-4" /></Button>
                  </form>
                ) : (
                  <>
                    <button type="button" title="Змінити час" onClick={() => setQuick({ id: i.id, start: i.time_start || '', end: i.time_end || '' })}
                      className="shrink-0 rounded-md px-1 font-mono text-xs font-bold tabular-nums text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
                      {i.time_start || '--:--'} – {i.time_end || '--:--'}
                    </button>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{sentenceCase(i.title)}</p>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Дублювати" title="Дублювати" onClick={() => setForm(editFrom(i, true))}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Редагувати" onClick={() => setForm(editFrom(i))}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Видалити" onClick={() => remove(i.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {i.target_teams?.length ? `Команди ${i.target_teams.join(', ')}` : 'Для всіх команд'}
                </span>
                {multi && (
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${ownedOnly(i.audience) ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {audienceLabel(i.audience)}
                  </span>
                )}
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

      <Dialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-sm overflow-y-auto">
          <DialogHeader><DialogTitle>Видалити розклад на {humanDate(date)}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Буде видалено події обраних змін ({wipeItems.length} шт) та їхні пакети розкладу ({wipeTargets.length} шт).
            {sorted.length > wipeItems.length && ` Спільні з іншими змінами та загальнотаборові події (${sorted.length - wipeItems.length}) залишаться.`}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmWipe(false)} disabled={busy}>Скасувати</Button>
            <Button variant="destructive" onClick={wipeDay} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Видалити весь день
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-sm overflow-y-auto">
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
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Початок</Label>
                  <Input
                    value={form.time_start}
                    onChange={(e) => setForm({ ...form, time_start: e.target.value })}
                    onBlur={(e) => {
                      const { start, end } = normalizeTimeRange(e.target.value);
                      setForm((p) => p && { ...p, time_start: start ?? p.time_start, time_end: end ?? p.time_end });
                    }}
                    placeholder="18:00 або 18.00"
                    className="h-10 w-full min-w-0 text-sm tabular-nums"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Кінець</Label>
                  <Input
                    value={form.time_end}
                    onChange={(e) => setForm({ ...form, time_end: e.target.value })}
                    onBlur={(e) => setForm((p) => p && { ...p, time_end: normalizeTime(e.target.value) ?? p.time_end })}
                    placeholder="19:00 або 19.00"
                    className="h-10 w-full min-w-0 text-sm tabular-nums"
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

              {shiftOptions.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Для змін</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {shiftOptions.map((s) => (
                      <button key={s.id} type="button" onClick={() => toggleFormShift(s.id)} className={chip(form.shifts.includes(s.id))}>{s.name}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Команди {form.target_teams.length === 0 && '(порожньо = всі команди обраних змін)'}
                </Label>
                {form.shifts.map((id) => {
                  const teams = byShift[id] ?? [];
                  const all = teams.length > 0 && teams.every((t) => form.target_teams.includes(t));
                  return (
                    <div key={id} className="space-y-1">
                      {form.shifts.length > 1 && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-foreground">{shiftName(id)}</span>
                          {teams.length > 0 && (
                            <button type="button" onClick={() => toggleShiftTeams(id)} className="text-[11px] text-primary">{all ? 'зняти' : 'уся зміна'}</button>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {teams.length ? teams.map((t) => (
                          <button key={t} type="button" onClick={() => toggleTeam(t)}
                            className={`h-8 w-8 rounded-lg text-xs font-bold border transition-all active:scale-95 ${form.target_teams.includes(t) ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border'}`}>
                            {t}
                          </button>
                        )) : <span className="text-[11px] text-muted-foreground">У зміни ще немає команд</span>}
                      </div>
                    </div>
                  );
                })}
                {form.target_teams.length > 0 && formTeams.length > 0 && (
                  <button type="button" onClick={() => setForm({ ...form, target_teams: [] })} className="text-[11px] text-primary">Скинути — для всіх</button>
                )}
              </div>

              {!form.id && repeatDays.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Repeat className="h-3 w-3" /> Повторити ще на дні {form.repeat.length > 0 && `(${form.repeat.length})`}
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {repeatDays.map((d) => (
                      <button key={d} type="button"
                        onClick={() => setForm({ ...form, repeat: form.repeat.includes(d) ? form.repeat.filter((x) => x !== d) : [...form.repeat, d] })}
                        className={chip(form.repeat.includes(d))}>
                        {shortDate(d)}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setForm({ ...form, repeat: repeatDays.filter((d) => d > date) })} className="text-[11px] text-primary">Щодня до кінця зміни</button>
                    {form.repeat.length > 0 && <button type="button" onClick={() => setForm({ ...form, repeat: [] })} className="text-[11px] text-muted-foreground">Очистити</button>}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={save} disabled={busy} className="w-full h-11 font-bold uppercase text-xs">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : form && !form.id && form.repeat.length ? `Зберегти на ${form.repeat.length + 1} дн.` : 'Зберегти'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAiStudioImportModal
        open={aiOpen}
        date={date}
        shiftIds={activeScope}
        onOpenChange={setAiOpen}
        onImported={(firstDate) => {
          if (firstDate && firstDate !== date) setDate(firstDate);
          else load();
        }}
      />
    </Card>
  );
};

export default AdminScheduleEditor;
