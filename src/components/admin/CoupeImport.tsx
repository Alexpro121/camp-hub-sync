import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Save, Train, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Shift } from '@/types/app';
import {
  groupByTeamThenCoupe, parseCoupes, verifyAgainstRoster,
  type CoupePassenger, type RosterChild,
} from '@/lib/coupes';
import CoupeCard from '@/components/coupes/CoupeCard';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { SINGLE_TRIP, TRAIN_TITLE } from '@/lib/trips';

/** Admin: paste or upload a train seating list, verify it, then store it. */
const CoupeImport = ({ onSaved }: { onSaved?: () => void } = {}) => {
  const island = useDynamicIsland();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftId, setShiftId] = useState<string>('');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<'local' | 'ai'>('local');
  const [rows, setRows] = useState<CoupePassenger[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('shifts').select('*').order('start_date', { ascending: false });
      const list = (data || []) as Shift[];
      setShifts(list);
      const active = list.find((s) => s.is_active) || list[0];
      if (active) setShiftId(active.id);
    })();
  }, []);

  const onFile = async (f: File) => {
    if (/\.(txt|csv)$/i.test(f.name)) {
      setText(await f.text());
      return;
    }
    if (/\.docx$/i.test(f.name)) {
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        const xml = await zip.file('word/document.xml')?.async('string');
        if (!xml) throw new Error('empty');
        const plain = xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        setText(plain);
      } catch {
        toast.error('Не вдалося прочитати .docx — встав текст вручну');
      }
      return;
    }
    toast.error('Підтримується .txt, .csv або .docx');
  };

  const runParse = async () => {
    if (!text.trim()) { toast.error('Встав текст розселення'); return; }
    setParsing(true);
    try {
      // 1. Smart Regex, then sequential positional parser
      const parsed = parseCoupes(text);
      let list = parsed.passengers;
      let src: 'local' | 'ai' = 'local';

      // 2. Fallback to Groq AI only when the regex found nothing
      if (!list.length) {
        try {
          island.showLoader();
          toast.loading('Groq AI аналізує текст потяга…', { id: 'coupe-ai' });
          const { data, error } = await supabase.functions.invoke('parse-coupes-ai', { body: { text } });
          toast.dismiss('coupe-ai');
          if (error) throw error;
          if (data?.error) throw new Error(data.message || data.error);
          list = (data?.passengers || []) as CoupePassenger[];
          src = 'ai';
          if (list.length) toast.success('Розпізнано за допомогою Groq AI');
        } catch (e: any) {
          toast.dismiss('coupe-ai');
          island.hide();
          toast.error('Не вдалося розпізнати текст', { description: e?.message || 'Перевірте формат або завантажте файл повторно' });
          return;
        }
        island.hide();
      }

      if (!list.length) { toast.error('Не вдалося розпізнати жодного пасажира'); return; }

      const { data: kids } = await supabase.from('children').select('id, full_name, team_number');
      const verified = verifyAgainstRoster(list, (kids || []) as RosterChild[]);
      // Inherit the team from the matched roster record when the text had none.
      const rosterById = new Map((kids || []).map((k: any) => [k.id, k.team_number]));
      setRows(verified.map((p) => ({
        ...p,
        team_number: p.team_number || (p.child_id ? rosterById.get(p.child_id) ?? 0 : 0),
      })));
      setSource(src);
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!rows?.length) return;
    setSaving(true);
    try {
      const teams = Array.from(new Set(rows.map((r) => r.team_number)));
      let del = supabase.from('train_coupes').delete().eq('trip_number', SINGLE_TRIP).in('team_number', teams);
      del = shiftId ? del.eq('shift_id', shiftId) : del.is('shift_id', null);
      await del;

      const payload = rows.map((r) => ({
        shift_id: shiftId || null,
        trip_number: SINGLE_TRIP,
        trip_name: TRAIN_TITLE,
        team_number: r.team_number,
        coupe_number: r.coupe_number,
        seat_number: r.seat_number,
        child_id: r.child_id ?? null,
        passenger_name: r.name,
        boarding_city: r.boarding_city,
        passenger_role: r.passenger_role ?? 'participant',
        is_staff: !r.matched,
      }));
      const { error } = await supabase.from('train_coupes').insert(payload);
      if (error) throw error;
      const teamLabel = teams.filter(Boolean).join(', ') || '—';
      island.showSuccess(`${TRAIN_TITLE} · команда №${teamLabel}`, `${payload.length} пасажирів збережено`);
      toast.success(`Збережено ${payload.length} пасажирів`);
      setRows(null);
      setText('');
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || 'Не вдалося зберегти розселення');
    } finally {
      setSaving(false);
    }
  };

  const matched = rows?.filter((r) => r.matched) ?? [];
  const unmatched = rows?.filter((r) => !r.matched) ?? [];
  const teamGroups = rows
    ? groupByTeamThenCoupe(rows.map((r) => ({ ...r, passenger_name: r.name, is_staff: !r.matched })))
    : [];

  return (
    <div className="space-y-3">
      <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50 space-y-3">
        <div className="flex items-center gap-2">
          <Train className="w-4 h-4 text-primary" strokeWidth={1.75} />
          <p className="text-sm font-semibold">Розселення по купе</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Зміна</Label>
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Обери зміну" /></SelectTrigger>
            <SelectContent>
              {shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Текст розселення</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder={'Команда 6\n5.Вакуленко Ксенія Євгеніївна\n6.Кушнер Вероніка Євгенівна\n12.Кундик Сергій - Львів'}
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Дані зберігаються 1-в-1. Номер купе = ceil(№ місця / 4). Місця «..» та «SS» пропускаються.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.docx"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-11" onClick={() => fileRef.current?.click()}>
            <FileUp className="w-4 h-4 mr-2" /> Документ
          </Button>
          <Button className="h-11" onClick={runParse} disabled={parsing}>
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Wand2 className="w-4 h-4 mr-2" /> Розібрати</>}
          </Button>
        </div>
      </Card>

      {rows && (
        <>
          <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50 space-y-2">
            <Badge variant="secondary" className="text-[10px]">
              {source === 'ai' ? 'Розібрано Groq AI (резерв)' : 'Розібрано смарт-парсером'}
            </Badge>
            <p className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={1.75} />
              Знайдено в базі списку табору: {matched.length} з {rows.length}
            </p>
            {unmatched.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} /> Не знайдено ({unmatched.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unmatched.map((u, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {u.name} · Супровід / Гість
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={save} disabled={saving} className="w-full h-11">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Зберегти розселення</>}
            </Button>
          </Card>

          {teamGroups.map((g) => (
            <div key={g.team_number} className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1">
                Команда №{g.team_number} · {g.total} пасажирів
              </p>
              {g.coupes.map((c) => (
                <CoupeCard key={`${g.team_number}-${c.coupe_number}`} coupeNumber={c.coupe_number} passengers={c.passengers as any} />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default CoupeImport;