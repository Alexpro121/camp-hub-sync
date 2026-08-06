import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Sparkles, Send, Loader2, CalendarDays, EyeOff, Plus, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { extractDate } from '@/lib/scheduleParser';
import { fallbackParse, detectCategory, type AiScheduleItem, type ScheduleCategory } from '@/lib/schedule-parser-fallback';
import { pushIsland } from '@/lib/islandBus';
import type { Schedule, ScheduleItem, Shift } from '@/types/app';
import { pickActiveShift } from '@/lib/shift';

const todayISO = () => new Date().toISOString().slice(0, 10);
const TEAMS = [1, 2, 3, 4, 5, 6, 7, 8];

const CATEGORIES: Array<{ value: ScheduleCategory; label: string }> = [
  { value: 'general', label: 'Загальне' },
  { value: 'meal', label: 'Харчування' },
  { value: 'sports', label: 'Спорт' },
  { value: 'gathering', label: 'Збір' },
  { value: 'entertainment', label: 'Розвага' },
  { value: 'transfer', label: 'Переїзд' },
];

const emptyRow = (): AiScheduleItem => ({
  time_start: null, time_end: null, title: '', description: null, target_teams: [], category: 'general',
});

const ScheduleAdmin = () => {
  const [raw, setRaw] = useState('');
  const [date, setDate] = useState(todayISO());
  const [draft, setDraft] = useState<AiScheduleItem[] | null>(null);
  const [source, setSource] = useState<'ai' | 'fallback' | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<Array<Schedule & { items: ScheduleItem[] }>>([]);

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
    pushIsland('ШІ аналізує розклад…', 'gradient');
    try {
      const { data, error } = await supabase.functions.invoke('parse-schedule-ai', { body: { rawText: raw } });
      const items = (data?.items ?? []) as Array<AiScheduleItem & { date?: string | null }>;
      if (error || data?.source !== 'ai' || !items.length) {
        applyLocal(data?.reason);
        return;
      }
      const mapped: AiScheduleItem[] = items.map((it) => ({
        time_start: it.time_start ?? null,
        time_end: it.time_end ?? null,
        title: it.title,
        description: null,
        target_teams: Array.isArray(it.target_teams) ? it.target_teams : [],
        category: it.category ?? detectCategory(it.title),
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
      pushIsland(`ШІ розпізнав ${mapped.length} подій`, 'success');
    } catch {
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

      const rows = draft.map((it, i) => ({
        schedule_id: sch.id,
        time_start: it.time_start,
        time_end: it.time_end,
        title: it.title || 'Подія',
        description: it.description,
        target_teams: it.target_teams,
        order_index: i,
      }));
      const { error: itErr } = await supabase.from('schedule_items').insert(rows);
      if (itErr) throw itErr;

      toast.success(isPublished ? 'Розклад опубліковано' : 'Чернетку збережено');
      if (isPublished) pushIsland('Новий розклад опубліковано', 'success');
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
      <Card className="p-5 bg-gradient-card space-y-3">
        <h3 className="font-bold uppercase text-sm tracking-wide">Створити розклад з тексту</h3>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={7}
          placeholder={'26.02\n07:45 - йога\n09:00-10:00 - сніданок\n9:00 - 1 і 2 команда - скеледром'}
          className="text-sm font-mono"
        />
        <Button onClick={recognize} disabled={parsing} className="w-full h-11 font-bold uppercase">
          {parsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> ШІ аналізує…</> : <><Sparkles className="w-4 h-4 mr-2" /> Розпізнати розклад</>}
        </Button>
      </Card>

      {draft && (
        <Card className="p-4 bg-gradient-card space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {source && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              source === 'ai' ? 'bg-success/15 text-success border-success/40' : 'bg-warning/15 text-warning border-warning/40'
            }`}>
              {source === 'ai' ? <Sparkles className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
              {source === 'ai' ? 'Розпізнано за допомогою ШІ Mistral' : 'Розпізнано локальним аналізатором (Резерв)'}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold uppercase text-sm tracking-wide">Чернетка</h3>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[150px] text-xs" />
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {draft.map((it, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-surface-1 p-3 space-y-2 transition-colors hover:border-primary/40">
                <div className="flex gap-2">
                  <Input value={it.time_start ?? ''} onChange={(e) => patch(i, { time_start: e.target.value || null })} placeholder="09:00" className="h-9 w-[86px] text-xs tabular-nums" />
                  <Input value={it.time_end ?? ''} onChange={(e) => patch(i, { time_end: e.target.value || null })} placeholder="10:00" className="h-9 w-[86px] text-xs tabular-nums" />
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
