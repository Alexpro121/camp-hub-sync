import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Mic2, Plus, Trash2, Coffee, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { TalentEntry, TalentEvent } from '@/types/app';
import { useHaptics } from '@/hooks/useHaptics';

interface Props { myTeam?: number | null; }

const TalentTeamView = ({ myTeam = null }: Props) => {
  const [event, setEvent] = useState<TalentEvent | null>(null);
  const [entries, setEntries] = useState<TalentEntry[]>([]);
  const [title, setTitle] = useState('');
  const [breaks, setBreaks] = useState('0');
  const [saving, setSaving] = useState(false);
  const haptics = useHaptics();

  const load = async () => {
    const { data: evs } = await supabase.from('talent_events').select('*').order('created_at', { ascending: false }).limit(1);
    const ev = (evs?.[0] as TalentEvent) || null;
    setEvent(ev);
    if (ev) {
      const { data } = await supabase.from('talent_entries').select('*').eq('event_id', ev.id).order('order_index');
      setEntries((data || []) as TalentEntry[]);
    }
  };

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 600); };
    const ch = supabase.channel('talent-team')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_entries' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_events' }, debounced)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, []);

  const add = async () => {
    if (!event || myTeam == null) return;
    if (!title.trim()) { toast.error('Введи назву номеру'); return; }
    setSaving(true);
    const { error } = await supabase.from('talent_entries').insert({
      event_id: event.id,
      team_number: myTeam,
      title: title.trim(),
      break_needed_after: Math.max(0, parseInt(breaks, 10) || 0),
      order_index: entries.length,
      created_by: `Команда #${myTeam}`,
    });
    setSaving(false);
    if (error) { toast.error('Не вдалося додати номер'); return; }
    haptics.notification('success');
    setTitle(''); setBreaks('0');
    toast.success('Номер додано');
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('talent_entries').delete().eq('id', id);
    load();
  };

  if (!event) {
    return (
      <Card className="p-8 text-center bg-gradient-card">
        <Mic2 className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Вечір талантів ще не оголошено</p>
      </Card>
    );
  }

  const collecting = event.status === 'collecting';
  const showOrder = event.status === 'finished' || event.status === 'generated';
  const mine = entries.filter((e) => e.team_number === myTeam);

  return (
    <div className="space-y-3">
      <Card className="p-4 bg-gradient-card space-y-3">
        <div className="flex items-center gap-2">
          <Mic2 className="w-5 h-5 text-primary" />
          <p className="font-bold uppercase text-sm tracking-wide flex-1">{event.title}</p>
          <Badge className="text-[9px] px-1.5 py-0 h-5 border bg-primary/20 text-primary border-primary/40">
            {collecting ? 'Збір номерів' : event.status === 'finished' ? 'Сценарій готовий' : 'Очікуй'}
          </Badge>
        </div>

        {collecting && myTeam != null && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Назва виступу</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Танець «Вогонь»" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Скільки номерів перерви потрібно після виступу</Label>
              <Input type="number" inputMode="numeric" value={breaks} onChange={(e) => setBreaks(e.target.value)} className="h-11" />
              <p className="text-[10px] text-muted-foreground">Наприклад, 2 — щоб встигнути переодягнутись.</p>
            </div>
            <Button onClick={add} disabled={saving} className="w-full h-11 font-bold uppercase">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1.5" /> Додати номер</>}
            </Button>
          </div>
        )}
      </Card>

      {mine.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold uppercase text-sm tracking-wide px-1">Мої номери</h3>
          {mine.map((e) => (
            <Card key={e.id} className="p-3 bg-surface-1 border-border/40 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{e.title}</p>
                {e.break_needed_after > 0 && (
                  <p className="text-[11px] text-warning flex items-center gap-1"><Coffee className="w-3 h-3" /> перерва {e.break_needed_after}</p>
                )}
              </div>
              {collecting && (
                <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {showOrder && entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold uppercase text-sm tracking-wide px-1">Порядок виступів</h3>
          {entries.map((e, i) => (
            <Card key={e.id} className={`p-3 flex items-center gap-3 ${e.team_number === myTeam ? 'bg-gradient-card border-primary/40' : 'bg-surface-1 border-border/40'}`}>
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-black text-sm shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{e.title}</p>
                <p className="text-[11px] text-muted-foreground">Команда #{e.team_number}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TalentTeamView;