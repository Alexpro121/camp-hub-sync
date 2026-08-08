import { useEffect, useState } from 'react';
import { useAllTeams } from '@/hooks/useAllTeams';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Wand2, Send, Loader2, CalendarDays, EyeOff, Plus, Cpu, Layers, Minus, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { extractDate } from '@/lib/scheduleParser';
import { fallbackParse, detectCategory, type AiScheduleItem, type ScheduleCategory } from '@/lib/schedule-parser-fallback';
import { CATEGORY_LIST, catMeta, shiftTime, normalizeTime, normalizeTimeRange } from '@/lib/scheduleCategories';
import AIErrorDialog, { type AiErrorInfo } from './AIErrorDialog';
import { pushIsland } from '@/lib/islandBus';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import type { Schedule, ScheduleItem, Shift } from '@/types/app';
import { pickActiveShift } from '@/lib/shift';
import { broadcastScheduleUpdated, itemKey } from '@/lib/schedule';

const todayISO = () => new Date().toISOString().slice(0, 10);


const CATEGORIES = CATEGORY_LIST;

const emptyRow = (): AiScheduleItem => ({
  time_start: null, time_end: null, title: '', description: null, target_teams: [],
  category: 'general', has_sub_slots: false, sub_slots: [],
});

const ScheduleAdmin = () => {
  const TEAMS = useAllTeams();
  const island = useDynamicIsland();
  const [raw, setRaw] = useState('');
  const [date, setDate] = useState(todayISO());
  const [draft, setDraft] = useState<AiScheduleItem[] | null>(null);
  const [source, setSource] = useState<'ai' | 'fallback' | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<Array<Schedule & { items: ScheduleItem[] }>>([]);
  const [aiError, setAiError] = useState<AiErrorInfo | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);

  const load = async () => {
    const { data: sch } = await supabase.from('schedules').select('*').order('date');
    const list = (sch || []) as Schedule[];
    const ids = list.map((s) => s.id);
    let its: ScheduleItem[] = [];
    if (ids.length) {
      const { data } = await supabase.from('schedule_items').select('*').in('schedule_id', ids).order('order_index');
      its = (data || []) as unknown as ScheduleItem[];
    }
    setExisting(list.map((s) => ({ ...s, items: its.filter((i) => i.schedule_id === s.id) })));
  };
  useEffect(() => { load(); }, []);

  const applyLocal = (reason?: string) => {
    const { items, date: d } = fallbackParse(raw);
    if (!items.length) { toast.error('Не вдалось розпізнати жодної події'); return false; }
    if (d) setDate(d);
    setDraft(items);
    setSource('fallback');
    pushIsland(`Розпізнано локально (${items.length})${reason ? ` · ${reason}` : ''}`, 'warning');
    return true;
  };

  const recognize = async () => {
    if (!raw.trim()) { toast.error('Встав текст розкладу'); return; }
    setParsing(true);
    setDraft(null);
    setSource(null);
    island.showLoader();
    try {
      const { data, error } = await supabase.functions.invoke('parse-schedule-ai', { body: { rawText: raw } });
      const items = (data?.items ?? []) as Array<AiScheduleItem & { date?: string | null }>;
      if (error || data?.error || data?.source !== 'ai' || !items.length) {
        const info: AiErrorInfo = {
          ...(data?.error ?? {}),
          reason: data?.reason ?? (error ? 'invoke_error' : 'empty_result'),
          code: data?.error?.code ?? (error ? 'EDGE_INVOKE_ERROR' : 'EMPTY_RESULT'),
          message: data?.error?.message ?? error?.message ?? 'ШІ не повернув подій',
        };
        const silent =
          info.code === 'TIMEOUT_8S' ||
          info.code === 'TIMEOUT_15S' ||
          info.code === 'TIMEOUT_10S' ||
          info.reason === 'timeout' ||
          /aborted/i.test(info.message ?? '');
        setAiError(info);
        island.showError('Помилка ШІ-розпізнавання', 'Натисніть для деталей', `${info.code} · ${info.message}`);
        if (!silent) setErrorOpen(true);
      }
      if (error || data?.source !== 'ai' || !items.length) {
        applyLocal(data?.reason);
        return;
      }
      const mapped: AiScheduleItem[] = items.map((it) => ({
        time_start: normalizeTime(it.time_start) ?? it.time_start ?? null,
        time_end: normalizeTime(it.time_end) ?? it.time_end ?? null,
        title: it.title,
        description: null,
        target_teams: Array.isArray(it.target_teams) ? it.target_teams : [],
        category: it.category ?? detectCategory(it.title),
        has_sub_slots: Boolean(it.has_sub_slots && it.sub_slots?.length),
        sub_slots: Array.isArray(it.sub_slots) ? it.sub_slots : [],
      }));
      const ddmm = items.find((i) => i.date)?.date ?? null;
      if (ddmm && /^\d{1,2}[.\/]\d{1,2}$/.test(ddmm)) {
        const [d, m] = ddmm.split(/[.\/]/);
        setDate(`${new Date().getFullYear()}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
      } else {
        const d = extractDate(raw);
        if (d) setDate(d);
      }
      setDraft(mapped);
      setSource('ai');
      island.showSuccess(`ШІ розпізнав ${mapped.length} подій`, 'Groq LPU');
    } catch (e: any) {
      setAiError({ code: 'CLIENT_EXCEPTION', status: 0, reason: 'offline', message: e?.message ?? 'offline', raw: '' });
      island.showError('Помилка ШІ-розпізнавання', 'Натисніть для деталей', e?.message ?? 'offline');
      setErrorOpen(true);
      applyLocal('offline');
    } finally {
      setParsing(false);
    }
  };

  const patch = (idx: number, values: Partial<AiScheduleItem>) =>
    setDraft((prev) => prev?.map((it, i) => (i === idx ? { ...it, ...values } : it)) ?? prev);

  const toggleTeam = (idx: number, team: number) =>
    setDraft((prev) => prev?.map((it, i) => {
      if (i !== idx) return it;
      const has = it.target_teams.includes(team);
      return { ...it, target_teams: has ? it.target_teams.filter((t) => t !== team) : [...it.target_teams, team].sort((a, b) => a - b) };
    }) ?? prev);

  const patchSlot = (idx: number, si: number, values: Partial<{ time: string; teams: number[] }>) =>
    setDraft((prev) => prev?.map((it, i) => (i === idx
      ? { ...it, sub_slots: it.sub_slots.map((s, k) => (k === si ? { ...s, ...values } : s)) }
      : it)) ?? prev);

  const toggleSlotTeam = (idx: number, si: number, team: number) =>
    setDraft((prev) => prev?.map((it, i) => {
      if (i !== idx) return it;
      return {
        ...it,
        sub_slots: it.sub_slots.map((s, k) => {
          if (k !== si) return s;
          const has = s.teams.includes(team);
          return { ...s, teams: has ? s.teams.filter((t) => t !== team) : [...s.teams, team].sort((a, b) => a - b) };
        }),
      };
    }) ?? prev);

  const swapSlots = (idx: number, si: number) =>
    setDraft((prev) => prev?.map((it, i) => {
      if (i !== idx || si + 1 >= it.sub_slots.length) return it;
      const slots = [...it.sub_slots];
      const a = slots[si];
      const b = slots[si + 1];
      slots[si] = { ...a, teams: b.teams };
      slots[si + 1] = { ...b, teams: a.teams };
      return { ...it, sub_slots: slots };
    }) ?? prev);

  const shiftAll = (delta: number) =>
    setDraft((prev) => prev?.map((it) => ({
      ...it,
      time_start: shiftTime(it.time_start, delta),
      time_end: shiftTime(it.time_end, delta),
      sub_slots: it.sub_slots.map((s) => ({ ...s, time: shiftTime(s.time, delta) ?? s.time })),
    })) ?? prev);

  const publish = async (isPublished: boolean) => {
    if (!draft?.length) return;
    setSaving(true);
    try {
      const { data: shifts } = await supabase.from('shifts').select('*').is('deleted_at', null).order('start_date', { ascending: false });
      const active = pickActiveShift((shifts || []) as Shift[]);

      const { data: sch, error } = await supabase
        .from('schedules')
        .insert({ shift_id: active?.id ?? null, date, raw_text: raw, is_published: isPublished })
        .select()
        .single();
      if (error || !sch) throw error;

      // Fresh import wins: wipe every event previously stored for this date so the
      // same items ("Швидка перекличка", "Вихід на активність") can never duplicate.
      const { data: sameDay } = await supabase.from('schedules').select('id').eq('date', date);
      const dayIds = (sameDay || []).map((s: { id: string }) => s.id).filter((id) => id !== sch.id);
      if (dayIds.length) {
        const { error: delErr } = await supabase.from('schedule_items').delete().in('schedule_id', dayIds);
        if (delErr) throw delErr;
      }

      const seen = new Set<string>();
      const all = draft.map((it, i) => ({
        schedule_id: sch.id,
        time_start: it.time_start,
        time_end: it.time_end,
        title: it.title || 'Подія',
        description: it.description,
        target_teams: it.target_teams,
        order_index: i,
        category: it.category,
        has_sub_slots: it.has_sub_slots && it.sub_slots.length > 0,
        sub_slots: it.sub_slots as unknown as any,
      }));
      // Drop duplicates inside the draft itself as well.
      const rows = all.filter((row) => {
        const k = itemKey(row as unknown as ScheduleItem);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (rows.length) {
        const { error: itErr } = await supabase.from('schedule_items').insert(rows);
        if (itErr) throw itErr;
      }

      toast.success(isPublished ? 'Розклад опубліковано' : 'Чернетку збережено');
      if (isPublished) pushIsland('Новий розклад опубліковано', 'success');
      await broadcastScheduleUpdated({ date, action: 'publish' });
      setDraft(null);
      setSource(null);
      setRaw('');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (s: Schedule) => {
    await supabase.from('schedules').update({ is_published: !s.is_published }).eq('id', s.id);
    load();
  };

  const removeSchedule = async (id: string) => {
    await supabase.from('schedules').delete().eq('id', id);
    load();
    toast.success('Розклад видалено');
  };

  return (
    <div className="space-y-4">
      <Card id="schedule-text-import" className="p-5 bg-gradient-card space-y-3">
        <h3 className="font-bold uppercase text-sm tracking-wide">Створити розклад з тексту</h3>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={7}
          placeholder={'26.02\n07:45 - йога\n09:00-10:00 - сніданок\n9:00 - 1 і 2 команда - скеледром'}
          className="text-sm font-mono"
        />
        <Button onClick={recognize} disabled={parsing} className="w-full h-11 font-bold uppercase">
          {parsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> ШІ аналізує…</> : <><Wand2 className="w-4 h-4 mr-2" strokeWidth={1.75} /> Розпізнати розклад</>}
        </Button>
      </Card>

      {draft && (
        <Card className="p-4 bg-gradient-card space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {source && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              source === 'ai' ? 'bg-success/15 text-success border-success/40' : 'bg-warning/15 text-warning border-warning/40'
            }`}>
              {source === 'ai' ? <Wand2 className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
              {source === 'ai' ? 'Розпізнано за допомогою ШІ Groq (LPU)' : 'Розпізнано локальним аналізатором (Резерв)'}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold uppercase text-sm tracking-wide">Чернетка</h3>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[150px] text-xs" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Зсув усього дня</span>
            <Button size="sm" variant="secondary" className="h-8 px-2 text-xs ml-auto" onClick={() => shiftAll(-15)}>
              <Minus className="w-3 h-3 mr-1" />15 хв
            </Button>
            <Button size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => shiftAll(15)}>
              <Plus className="w-3 h-3 mr-1" />15 хв
            </Button>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {draft.map((it, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-surface-1 p-3 space-y-2 transition-colors hover:border-primary/40">
                <div className="flex gap-2">
                  <Input
                    value={it.time_start ?? ''}
                    onChange={(e) => patch(i, { time_start: e.target.value || null })}
                    onBlur={(e) => {
                      const { start, end } = normalizeTimeRange(e.target.value);
                      patch(i, { time_start: start ?? it.time_start, ...(end ? { time_end: end } : {}) });
                    }}
                    placeholder="09:00 або 9.00"
                    className="h-9 w-[86px] text-xs tabular-nums"
                  />
                  <Input
                    value={it.time_end ?? ''}
                    onChange={(e) => patch(i, { time_end: e.target.value || null })}
                    onBlur={(e) => patch(i, { time_end: normalizeTime(e.target.value) ?? it.time_end })}
                    placeholder="10:00 або 10.00"
                    className="h-9 w-[86px] text-xs tabular-nums"
                  />
                  <Button size="icon" variant="ghost" className="h-9 w-9 ml-auto shrink-0" onClick={() => setDraft((p) => p!.filter((_, k) => k !== i))}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <Input value={it.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder="Назва події" className="h-10 text-sm" />
                <Select value={it.category} onValueChange={(v) => patch(i, { category: v as ScheduleCategory })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Команди {it.target_teams.length === 0 && '(порожньо = всі)'}
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEAMS.map((t) => {
                      const on = it.target_teams.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTeam(i, t)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                            on ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border hover:border-primary/50'
                          }`}
                        >{t}</button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-border/50 bg-surface-2/60 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] uppercase tracking-wider font-bold">Почергові слоти</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px] ml-auto"
                      onClick={() => patch(i, {
                        has_sub_slots: true,
                        sub_slots: [...it.sub_slots, { time: it.time_start ?? '', teams: [] }],
                      })}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Слот
                    </Button>
                  </div>
                  {it.sub_slots.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">Без почергових слотів — подія для всіх одночасно.</p>
                  )}
                  {it.sub_slots.map((s, si) => (
                    <div key={si} className="rounded-lg bg-surface-1 border border-border/40 p-2 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={s.time}
                          onChange={(e) => patchSlot(i, si, { time: e.target.value })}
                          placeholder="16:45"
                          className="h-8 w-[76px] text-xs tabular-nums"
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Поміняти команди з наступним слотом" onClick={() => swapSlots(i, si)}>
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 ml-auto"
                          onClick={() => {
                            const next = it.sub_slots.filter((_, k) => k !== si);
                            patch(i, { sub_slots: next, has_sub_slots: next.length > 0 });
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {TEAMS.map((t) => {
                          const on = s.teams.includes(t);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => toggleSlotTeam(i, si, t)}
                              className={`h-7 w-7 rounded-md text-[11px] font-bold border transition-all active:scale-95 ${
                                on ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border'
                              }`}
                            >{t}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={() => setDraft((p) => [...(p ?? []), emptyRow()])} className="w-full h-10 text-xs font-bold uppercase">
            <Plus className="w-4 h-4 mr-1.5" /> Додати рядок
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => publish(false)} className="h-11 font-bold uppercase text-xs">
              Зберегти чернетку
            </Button>
            <Button disabled={saving} onClick={() => publish(true)} className="h-11 font-bold uppercase text-xs">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1.5" /> Опублікувати</>}
            </Button>
          </div>
        </Card>
      )}

      {aiError && !errorOpen && (
        <button
          onClick={() => setErrorOpen(true)}
          className="w-full flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Показати деталі помилки ШІ ({aiError.code})
        </button>
      )}

      <AIErrorDialog
        open={errorOpen}
        onOpenChange={setErrorOpen}
        info={aiError}
        onFallback={() => { if (!draft) { if (!applyLocal('manual')) setDraft([emptyRow()]); } }}
      />

      <div className="space-y-2">
        <h3 className="font-bold uppercase text-sm tracking-wide px-1">Збережені розклади</h3>
        {existing.length === 0 && (
          <Card className="p-6 text-center bg-card/50"><p className="text-sm text-muted-foreground">Поки що порожньо</p></Card>
        )}
        {existing.map((s) => (
          <Card key={s.id} className="p-3.5 bg-gradient-card flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold">{s.date}</p>
                <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${s.is_published ? 'bg-success/20 text-success border-success/40' : 'bg-muted text-muted-foreground border-border'}`}>
                  {s.is_published ? 'Опубліковано' : 'Чернетка'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{s.items.length} подій</p>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => togglePublish(s)} title="Публікація">
              {s.is_published ? <EyeOff className="w-4 h-4" /> : <Send className="w-4 h-4 text-primary" />}
            </Button>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => removeSchedule(s.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ScheduleAdmin;
