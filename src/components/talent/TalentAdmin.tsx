import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic2, Play, Wand2, ChevronUp, ChevronDown, Trash2, Send, Loader2, Coffee, Pencil, Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { TalentEntry, TalentEvent } from '@/types/app';
import { buildRunningOrder } from '@/lib/talent';
import { useActiveShift } from '@/context/ActiveShiftContext';
import TalentEntryEditDialog from '@/components/talent/TalentEntryEditDialog';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Чернетка', cls: 'bg-muted text-muted-foreground border-border' },
  collecting: { label: 'Збір номерів', cls: 'bg-primary/20 text-primary border-primary/40' },
  generated: { label: 'Сценарій готовий', cls: 'bg-warning/20 text-warning border-warning/40' },
  finished: { label: 'Опубліковано', cls: 'bg-success/20 text-success border-success/40' },
};

/** Stable per-team accent so the balance of the running order is readable at a glance. */
const TEAM_ACCENTS = [
  'bg-sky-500/15 text-sky-300 border-sky-500/40',
  'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  'bg-amber-500/15 text-amber-300 border-amber-500/40',
  'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
  'bg-rose-500/15 text-rose-300 border-rose-500/40',
  'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
  'bg-teal-500/15 text-teal-300 border-teal-500/40',
  'bg-orange-500/15 text-orange-300 border-orange-500/40',
];
const teamAccent = (team: number) => TEAM_ACCENTS[Math.abs(team) % TEAM_ACCENTS.length];

const TalentAdmin = () => {
  const { shiftId, shift } = useActiveShift();
  const [event, setEvent] = useState<TalentEvent | null>(null);
  const [entries, setEntries] = useState<TalentEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TalentEntry | null>(null);

  const load = async () => {
    let q = supabase.from('talent_events').select('*').order('created_at', { ascending: false }).limit(1);
    if (shiftId) q = q.eq('shift_id', shiftId);
    const { data: evs } = await q;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId]);

  const startCollecting = async () => {
    setBusy(true);
    const { error } = await supabase.from('talent_events').insert({ shift_id: shiftId, status: 'collecting' });
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

  const exportXlsx = () => {
    if (!entries.length) { toast.error('Немає номерів для експорту'); return; }
    const rows = entries.map((e, i) => ({
      '№ з/п': i + 1,
      'Команда': `№${e.team_number}`,
      'Назва номера': e.title,
      'Опис / Учасники / Реквізит': e.description ?? '',
      'Перерва після номера': e.break_needed_after ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 7 }, { wch: 12 }, { wch: 34 }, { wch: 48 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Програма');
    const safeName = (shift?.name || 'Зміна').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Програма_Таланти_Команда_${safeName}.xlsx`);
    toast.success('Програму експортовано');
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
      <TalentEntryEditDialog entry={editing} open={!!editing} onClose={() => setEditing(null)} onSaved={load} />

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
        <Button variant="outline" onClick={exportXlsx} disabled={entries.length === 0} className="w-full h-11 font-bold uppercase text-xs">
          <Download className="w-4 h-4 mr-1.5" /> Експорт програми (.xlsx)
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="w-full h-9 text-[11px] text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Новий вечір талантів
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-md bg-gradient-card border-border/60">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-black uppercase text-foreground">
                Розпочати новий вечір талантів?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Поточну подію буде архівовано, а збір номерів розпочнеться заново. Цю дію неможливо скасувати.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="h-11">Скасувати</AlertDialogCancel>
              <AlertDialogAction onClick={startCollecting} className="h-11 bg-gradient-primary font-bold shadow-glow">
                Підтвердити
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </Card>

      <div className="space-y-2">
        {entries.map((e, i) => (
          <Card key={e.id} className={`p-3 border flex items-center gap-2 transition-smooth ${teamAccent(e.team_number)}`}>
            <div className="w-11 h-9 rounded-lg bg-gradient-primary text-primary-foreground flex items-center justify-center font-black text-xs shrink-0 tabular-nums">
              №{i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate text-foreground">{e.title}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                Команда #{e.team_number}
                {e.break_needed_after > 0 && (
                  <span className="flex items-center gap-0.5 text-warning"><Coffee className="w-3 h-3" />{e.break_needed_after}</span>
                )}
              </p>
              {e.description && <p className="text-[10px] text-muted-foreground/80 truncate">{e.description}</p>}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Вгору"
                className="h-8 w-9 rounded-lg bg-surface-1 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-smooth disabled:opacity-30"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === entries.length - 1}
                aria-label="Вниз"
                className="h-8 w-9 rounded-lg bg-surface-1 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-smooth disabled:opacity-30"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setEditing(e)} aria-label="Редагувати">
              <Pencil className="w-4 h-4 text-primary" />
            </Button>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => remove(e.id)} aria-label="Видалити">
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </Card>
        ))}
        {entries.length === 0 && (
          <Card className="p-6 text-center bg-card/50"><p className="text-sm text-muted-foreground">Супровід ще не додав номери</p></Card>
        )}
      </div>
    </div>
  );
};

export default TalentAdmin;
