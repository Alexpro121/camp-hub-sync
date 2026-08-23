import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Mic2, 
  Play, 
  Wand2, 
  ChevronUp, 
  ChevronDown, 
  Trash2, 
  Send, 
  Loader2, 
  Coffee, 
  Pencil, 
  Download, 
  Sparkles,
  Users,
  Search,
  CheckCircle2,
  Radio,
  Clock
} from 'lucide-react';
import {
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent,
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { TalentEntry, TalentEvent } from '@/types/app';
import { buildRunningOrder } from '@/lib/talent';
import { useActiveShift } from '@/context/ActiveShiftContext';
import TalentEntryEditDialog from '@/components/talent/TalentEntryEditDialog';

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  draft: { 
    label: 'Чернетка', 
    cls: 'bg-muted/60 text-muted-foreground border-border/60',
    dot: 'bg-muted-foreground'
  },
  collecting: { 
    label: 'Збір номерів', 
    cls: 'bg-[#FA5A15]/15 text-[#FA5A15] border-[#FA5A15]/30',
    dot: 'bg-[#FA5A15] animate-pulse'
  },
  generated: { 
    label: 'Сценарій сформовано', 
    cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    dot: 'bg-amber-500'
  },
  finished: { 
    label: 'Опубліковано для табору', 
    cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    dot: 'bg-emerald-500'
  },
};

/** Стабільні колірні акценти команд для швидкого візуального розрізнення */
const TEAM_ACCENTS = [
  'border-sky-500/30 bg-sky-500/[0.04]',
  'border-emerald-500/30 bg-emerald-500/[0.04]',
  'border-amber-500/30 bg-amber-500/[0.04]',
  'border-purple-500/30 bg-purple-500/[0.04]',
  'border-rose-500/30 bg-rose-500/[0.04]',
  'border-indigo-500/30 bg-indigo-500/[0.04]',
  'border-teal-500/30 bg-teal-500/[0.04]',
  'border-[#FA5A15]/30 bg-[#FA5A15]/[0.04]',
];
const teamAccent = (team: number) => TEAM_ACCENTS[Math.abs(team) % TEAM_ACCENTS.length];

const TalentAdmin = () => {
  const { shiftId, shift } = useActiveShift();
  const [event, setEvent] = useState<TalentEvent | null>(null);
  const [entries, setEntries] = useState<TalentEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TalentEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

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
      message: 'Розпочато збір номерів на Вечір талантів! Супровід може додавати виступи.',
      color: 'gradient',
      target_teams: [],
      sent_by: 'Супровід',
    });
    toast.success('Збір номерів успішно розпочато');
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
    if (!event || entries.length === 0) { toast.error('Немає номерів для формування'); return; }
    setBusy(true);
    const ordered = buildRunningOrder(entries);
    await persistOrder(ordered as TalentEntry[]);
    await supabase.from('talent_events').update({ status: 'generated' }).eq('id', event.id);
    setBusy(false);
    toast.success('Сценарій та чергу виступів сформовано');
    load();
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...entries];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    persistOrder(next);
  };

  const confirmRemove = async () => {
    if (!deleteCandidateId) return;
    await supabase.from('talent_entries').delete().eq('id', deleteCandidateId);
    setDeleteCandidateId(null);
    toast.success('Номер видалено');
    load();
  };

  const exportXlsx = () => {
    if (!entries.length) { toast.error('Немає номерів для експорту'); return; }
    const rows = entries.map((e, i) => ({
      '№ з/п': i + 1,
      'Команда': `№${e.team_number}`,
      'Назва номера': e.title,
      'Опис / Учасники / Реквізит': e.description ?? '',
      'Перерва після номера (хв)': e.break_needed_after ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 34 }, { wch: 48 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Програма виступів');
    const safeName = (shift?.name || 'Зміна').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Програма_Таланти_${safeName}.xlsx`);
    toast.success('Програму експортовано у файл Excel');
  };

  const publish = async () => {
    if (!event) return;
    await setStatus('finished');
    await supabase.from('broadcasts').insert({
      message: 'Сценарій Вечора талантів опубліковано — переглядайте чергу виступів у хабі!',
      color: 'gradient',
      target_teams: [],
      sent_by: 'Супровід',
    });
    toast.success('Сценарій успішно опубліковано для всього табору');
  };

  // Фільтрація номерів при пошуку
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(e => 
      e.title.toLowerCase().includes(q) || 
      e.team_number.toString().includes(q) ||
      (e.description && e.description.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  const uniqueTeamsCount = useMemo(() => new Set(entries.map((e) => e.team_number)).size, [entries]);
  const totalBreaks = useMemo(() => entries.filter(e => e.break_needed_after > 0).length, [entries]);

  /* =========================================================================
     СТАН 1: ПОДІЮ ЩЕ НЕ СТВОРЕНО
  ========================================================================= */
  if (!event) {
    return (
      <Card className="p-6 sm:p-8 bg-card/85 backdrop-blur-md border-border/60 text-center space-y-4 shadow-xl select-none">
        <div className="relative w-16 h-16 mx-auto rounded-3xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shadow-inner">
          <Mic2 className="w-8 h-8 text-[#FA5A15]" />
          <div className="absolute inset-0 rounded-3xl bg-[#FA5A15]/20 blur-lg animate-pulse" />
        </div>
        
        <div>
          <h2 className="text-xl font-bold text-foreground">Вечір талантів</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Створіть подію, щоб відкрити супроводу команд можливість подавати номери та реквізит.
          </p>
        </div>

        <Button 
          onClick={startCollecting} 
          disabled={busy} 
          className="w-full h-12 font-bold uppercase tracking-wider bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-all shadow-md gap-2"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Розпочати збір номерів</span>
            </>
          )}
        </Button>
      </Card>
    );
  }

  const meta = STATUS_META[event.status] ?? STATUS_META.draft;

  /* =========================================================================
     СТАН 2: ГОЛОВНА ПАНЕЛЬ КЕРУВАННЯ ВЕЧОРОМ ТАЛАНТІВ
  ========================================================================= */
  return (
    <div className="space-y-3 select-none">
      <TalentEntryEditDialog entry={editing} open={!!editing} onClose={() => setEditing(null)} onSaved={load} />

      {/* Діалог підтвердження видалення номера */}
      <AlertDialog open={!!deleteCandidateId} onOpenChange={(open) => !open && setDeleteCandidateId(null)}>
        <AlertDialogContent className="max-w-md bg-card border-border/60">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              Видалити цей номер з програми?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-muted-foreground">
              Цей виступ буде назавжди видалено зі списку програми. Ви зможете додати його лише наново.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="h-10">Скасувати</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmRemove} 
              className="h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
            >
              Видалити номер
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Головна картка статусу події */}
      <Card className="p-4 sm:p-5 bg-card/85 backdrop-blur-md border-border/60 space-y-4 shadow-sm relative overflow-hidden">
        
        {/* Верхній рядок з заголовком та бейджем */}
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/25 flex items-center justify-center shrink-0">
              <Mic2 className="w-4 h-4 text-[#FA5A15]" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm sm:text-base text-foreground tracking-tight truncate">
                {event.title || 'Вечір талантів'}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">
                Система координації сцени
              </p>
            </div>
          </div>

          <Badge className={`text-[10px] px-2.5 py-1 rounded-full border flex items-center gap-1.5 shrink-0 ${meta.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            <span className="font-semibold">{meta.label}</span>
          </Badge>
        </div>

        {/* Швидка статистика у сітці */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-surface-1/50 border border-border/40">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Номерів</span>
            <span className="text-base sm:text-lg font-black font-mono text-foreground mt-0.5 block">{entries.length}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-1/50 border border-border/40">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Команд</span>
            <span className="text-base sm:text-lg font-black font-mono text-foreground mt-0.5 block">{uniqueTeamsCount}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-1/50 border border-border/40">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Пауз/Реквізит</span>
            <span className="text-base sm:text-lg font-black font-mono text-amber-500 mt-0.5 block">{totalBreaks}</span>
          </div>
        </div>

        {/* Панель основних дій */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            {event.status !== 'collecting' ? (
              <Button 
                variant="outline" 
                onClick={() => setStatus('collecting')} 
                className="h-11 text-xs font-bold uppercase tracking-wider border-border/60 hover:bg-muted/50 active:scale-95 transition-all"
              >
                <Radio className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                Відкрити збір
              </Button>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => setStatus('draft')} 
                className="h-11 text-xs font-bold uppercase tracking-wider border-border/60 hover:bg-muted/50 active:scale-95 transition-all text-amber-500"
              >
                Закрити збір
              </Button>
            )}

            <Button 
              onClick={generate} 
              disabled={busy || entries.length === 0} 
              className="h-11 text-xs font-bold uppercase tracking-wider bg-surface-1 hover:bg-muted/70 text-foreground border border-border/60 active:scale-95 transition-all"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" />
              Сформувати
            </Button>
          </div>

          {/* Кнопка публікації сценарію */}
          <Button 
            onClick={publish} 
            disabled={entries.length === 0 || event.status === 'finished'} 
            className="w-full h-11 font-bold uppercase text-xs tracking-wider bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
          >
            {event.status === 'finished' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Сценарій опубліковано</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Опублікувати для табору</span>
              </>
            )}
          </Button>

          {/* Додаткові утиліти: Експорт та Новий вечір */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button 
              variant="ghost" 
              onClick={exportXlsx} 
              disabled={entries.length === 0} 
              className="flex-1 h-9 text-xs text-muted-foreground hover:text-foreground font-semibold"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
              <span>Експорт .xlsx</span>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="flex-1 h-9 text-xs text-muted-foreground hover:text-foreground font-semibold">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
                  <span>Новий вечір</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md bg-card border-border/60">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-lg font-bold text-foreground">
                    Розпочати новий вечір талантів?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs sm:text-sm text-muted-foreground">
                    Поточну подію буде переведено в архів, а збір номерів розпочнеться заново з чистого аркуша.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0">
                  <AlertDialogCancel className="h-10">Скасувати</AlertDialogCancel>
                  <AlertDialogAction onClick={startCollecting} className="h-10 bg-[#FA5A15] hover:bg-[#FF7D3B] text-white font-bold">
                    Підтвердити створення
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

      </Card>

      {/* Пошук номерів, якщо їх більше 4 */}
      {entries.length > 4 && (
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
          <Input
            placeholder="Пошук за назвою або командою..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 text-xs bg-card/60 border-border/50 rounded-xl"
          />
        </div>
      )}

      {/* =========================================================================
          СПИСОК НОМЕРІВ ТА ПОРЯДОК ВИСТУПІВ
      ========================================================================= */}
      <div className="space-y-2">
        {filteredEntries.map((e, i) => (
          <Card 
            key={e.id} 
            className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 transition-all ${teamAccent(e.team_number)}`}
          >
            {/* Порядковий номер */}
            <div className="w-10 h-10 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 text-[#FA5A15] flex items-center justify-center font-mono font-black text-xs shrink-0 tabular-nums shadow-inner">
              №{i + 1}
            </div>

            {/* Інформація про номер */}
            <div className="flex-1 min-w-0 pr-1">
              <p className="text-sm font-bold text-foreground truncate tracking-tight">
                {e.title}
              </p>
              
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                <span className="font-semibold text-foreground/80">Команда #{e.team_number}</span>
                
                {e.break_needed_after > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-500 font-medium font-mono bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                    <Coffee className="w-3 h-3" />
                    <span>{e.break_needed_after} хв пауза</span>
                  </span>
                )}
              </div>

              {e.description && (
                <p className="text-[10px] text-muted-foreground/80 truncate mt-1">
                  {e.description}
                </p>
              )}
            </div>

            {/* Блок дій: Переміщення та Редагування */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Стрілки вгору/вниз */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Перемістити вгору"
                  className="h-6 w-8 rounded-md bg-card hover:bg-muted/60 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all disabled:opacity-20"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === entries.length - 1}
                  aria-label="Перемістити вниз"
                  className="h-6 w-8 rounded-md bg-card hover:bg-muted/60 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all disabled:opacity-20"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Редагувати */}
              <Button 
                size="icon" 
                variant="ghost" 
                className="w-8 h-8 rounded-lg hover:bg-card active:scale-90 transition-all" 
                onClick={() => setEditing(e)} 
                aria-label="Редагувати"
              >
                <Pencil className="w-3.5 h-3.5 text-[#FA5A15]" />
              </Button>

              {/* Видалити */}
              <Button 
                size="icon" 
                variant="ghost" 
                className="w-8 h-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive active:scale-90 transition-all" 
                onClick={() => setDeleteCandidateId(e.id)} 
                aria-label="Видалити"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Card>
        ))}

        {/* Пустий стан списку */}
        {entries.length === 0 && (
          <Card className="p-8 text-center bg-card/60 border-border/50 space-y-2 rounded-2xl">
            <Clock className="w-8 h-8 text-muted-foreground/50 mx-auto" />
            <p className="text-xs sm:text-sm font-semibold text-foreground">Заявки відсутні</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Супровід команд ще не подав номери на виступ. Відкрийте збір, щоб розпочати прийом.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TalentAdmin;
