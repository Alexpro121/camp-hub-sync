import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic2, Play, Wand2, ChevronUp, ChevronDown, Trash2, Send, Loader2, Coffee } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Shift, TalentEntry, TalentEvent } from '@/types/app';
import { buildRunningOrder } from '@/lib/talent';
import { pickActiveShift } from '@/lib/shift';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Чернетка', cls: 'bg-muted text-muted-foreground border-border' },
  collecting: { label: 'Збір номерів', cls: 'bg-primary/20 text-primary border-primary/40' },
  generated: { label: 'Сценарій готовий', cls: 'bg-warning/20 text-warning border-warning/40' },
  finished: { label: 'Опубліковано', cls: 'bg-success/20 text-success border-success/40' },
};

const TalentAdmin = () => {
  const [event, setEvent] = useState<TalentEvent | null>(null);
  const [entries, setEntries] = useState<TalentEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: evs } = await supabase.from('talent_events').select('*').order('created_at', { ascending: false }).limit(1);
    const ev = (evs?.[0] as TalentEvent) || null;
    setEvent(ev);
    if (ev) {
      const { data } = await supabase.from('talent_entries').select('*').eq('event_id', ev.id).order('order_index');
      setEntries((data || []) as TalentEntry[]);
    } else {
      setEntries([]);
    }
  };

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 500); };
    const ch = supabase.channel('talent-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_entries' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_events' }, debounced)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, []);

  const startCollecting = async () => {
    setBusy(true);
    const { data: shifts } = await supabase.from('shifts').select('*').is('deleted_at', null).order('start_date', { ascending: false });
    const active = pickActiveShift((shifts || []) as Shift[]);
    const { error } = await supabase.from('talent_events').insert({ shift_id: active?.id ?? null, status: 'collecting' });
    setBusy(false);
    if (error) { toast.error('Не вдалося створити подію'); return; }
    await supabase.from('broadcasts').insert({
      message: 'Розпочато збір номерів на Вечір талантів!',
      color: 'gradient',
      target_teams: [],
      sent_by: 'Адмін',
    });
    toast.success('Збір номерів розпочато');
    load();
  };

  const setStatus = async (status: TalentEvent['status']) => {
    if (!event) return;
    await supabase.from('talent_events').update({ status }).eq('id', event.id);
    load();
  };

  const persistOrder = async (list: TalentEntry[]) => {
    setEntries(list);
    await Promise.all(list.map((e, i) => supabase.from('talent_entries').update({ order_index: i }).eq('id', e.id)));
  };

  const generate = async () => {
    if (!event || entries.length === 0) { toast.error('Немає номерів'); return; }
    setBusy(true);
    const ordered = buildRunningOrder(entries);
    await persistOrder(ordered as TalentEntry[]);
    await supabase.from('talent_events').update({ status: 'generated' }).eq('id', event.id);
    setBusy(false);
    toast.success('Сценарій сформовано');
    load();
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...entries];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    persistOrder(next);
  };

  const remove = async (id: string) => {
    await supabase.from('talent_entries').delete().eq('id', id);
    load();
  };

  const publish = async () => {
    if (!event) return;
    await setStatus('finished');
    await supabase.from('broadcasts').insert({
      message: 'Сценарій Вечора талантів опубліковано — дивіться порядок виступів!',
      color: 'gradient',
      target_teams: [],
      sent_by: 'Адмін',
    });
    toast.success('Сценарій опубліковано');
  };

  if (!event) {
    return (
      <Card className="p-6 bg-gradient-card text-center space-y-3">
        <Mic2 className="w-10 h-10 text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Вечір талантів ще не створено</p>
        <Button onClick={startCollecting} disabled={busy} className="w-full h-12 font-bold uppercase">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Play className="w-4 h-4 mr-2" /> Розпочати збір номерів</>}
        </Button>
      </Card>
    );
  }

  const meta = STATUS_META[event.status] ?? STATUS_META.draft;

  return (
    <div className="space-y-3">
      <Card className="p-4 bg-gradient-card space-y-3">
        <div className="flex items-center gap-2">
          <Mic2 className="w-5 h-5 text-primary" />
          <p className="font-bold uppercase text-sm tracking-wide flex-1">{event.title}</p>
          <Badge className={`text-[9px] px-1.5 py-0 h-5 border ${meta.cls}`}>{meta.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{entries.length} номерів · {new Set(entries.map((e) => e.team_number)).size} команд</p>

        <div className="grid grid-cols-2 gap-2">
          {event.status !== 'collecting' ? (
            <Button variant="secondary" onClick={() => setStatus('collecting')} className="h-11 text-xs font-bold uppercase">Відкрити збір</Button>
          ) : (
            <Button variant="secondary" onClick={() => setStatus('draft')} className="h-11 text-xs font-bold uppercase">Закрити збір</Button>
          )}
          <Button onClick={generate} disabled={busy} className="h-11 text-xs font-bold uppercase">
            <Wand2 className="w-4 h-4 mr-1.5" /> Сформувати
          </Button>
        </div>
        <Button onClick={publish} disabled={entries.length === 0} className="w-full h-11 font-bold uppercase text-xs bg-gradient-primary">
          <Send className="w-4 h-4 mr-1.5" /> Опублікувати сценарій
        </Button>
        <Button variant="ghost" onClick={startCollecting} className="w-full h-9 text-[11px] text-muted-foreground">
          Новий вечір талантів
        </Button>
      </Card>

      <div className="space-y-2">
        {entries.map((e, i) => (
          <Card key={e.id} className="p-3 bg-surface-1 border-border/40 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary text-primary-foreground flex items-center justify-center font-black text-sm shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{e.title}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                Команда #{e.team_number}
                {e.break_needed_after > 0 && (
                  <span className="flex items-center gap-0.5 text-warning"><Coffee className="w-3 h-3" />{e.break_needed_after}</span>
                )}
              </p>
            </div>
            <div className="flex flex-col shrink-0">
              <button onClick={() => move(i, -1)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronUp className="w-4 h-4" /></button>
              <button onClick={() => move(i, 1)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronDown className="w-4 h-4" /></button>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => remove(e.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </Card>
        ))}
        {entries.length === 0 && (
          <Card className="p-6 text-center bg-card/50"><p className="text-sm text-muted-foreground">Вожаті ще не додали номери</p></Card>
        )}
      </div>
    </div>
  );
};

export default TalentAdmin;