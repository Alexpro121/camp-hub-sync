import { useEffect, useState, useMemo, useCallback } from 'react';
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
  Search,
  CheckCircle2,
  Radio,
  Clock,
  Link2,
  Copy,
  Paperclip,
  Minus,
  Plus,
  ExternalLink,
  Check,
  KeyRound,
  X,
  Music,
  Share2
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
import { parseAttachments } from '@/lib/talentMedia';
import { useHaptics } from '@/hooks/useHaptics';

/** Генератор українського пароля сцени формату слово.слово */
const STAGE_WORDS_A = ['сцена', 'локомотив', 'вогонь', 'карпати', 'колія', 'софіт', 'мікрофон', 'гуцул', 'вершина', 'сталь'];
const STAGE_WORDS_B = ['звук', 'драйв', 'ритм', 'світло', 'пульт', 'акорд', 'ефір', 'фінал', 'бас', 'промінь'];
const genStagePassword = () =>
  `${STAGE_WORDS_A[Math.floor(Math.random() * STAGE_WORDS_A.length)]}.${STAGE_WORDS_B[Math.floor(Math.random() * STAGE_WORDS_B.length)]}`;

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  draft: { 
    label: 'Чернетка', 
    cls: 'bg-slate-800 text-slate-300 border-white/10',
    dot: 'bg-slate-400'
  },
  collecting: { 
    label: 'Збір заявок', 
    cls: 'bg-[#FA5A15]/15 text-[#FA5A15] border-[#FA5A15]/30',
    dot: 'bg-[#FA5A15] animate-pulse'
  },
  generated: { 
    label: 'Порядок сформовано', 
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400'
  },
  finished: { 
    label: 'Опубліковано', 
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400'
  },
};

/** Акценти команд для темного інтерфейсу */
const TEAM_ACCENTS = [
  'bg-sky-500/10 text-sky-300 border-sky-500/20 hover:border-sky-500/40',
  'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:border-emerald-500/40',
  'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:border-amber-500/40',
  'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20 hover:border-fuchsia-500/40',
  'bg-rose-500/10 text-rose-300 border-rose-500/20 hover:border-rose-500/40',
  'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:border-indigo-500/40',
  'bg-teal-500/10 text-teal-300 border-teal-500/20 hover:border-teal-500/40',
  'bg-[#FA5A15]/10 text-orange-300 border-[#FA5A15]/20 hover:border-[#FA5A15]/40',
];
const teamAccent = (team: number) => TEAM_ACCENTS[Math.abs(team) % TEAM_ACCENTS.length];

/** Схиляння слова "виступ" */
function formatActsCount(count: number): string {
  const abs = Math.abs(count) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return `${count} виступів`;
  if (rem > 1 && rem < 5) return `${count} виступи`;
  if (rem === 1) return `${count} виступ`;
  return `${count} виступів`;
}

const TalentAdmin = () => {
  const { shiftId, shift } = useActiveShift();
  const haptics = useHaptics();

  const [event, setEvent] = useState<TalentEvent | null>(null);
  const [entries, setEntries] = useState<TalentEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TalentEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [stagePassword, setStagePassword] = useState<string | null>(null);
  const [stageBusy, setStageBusy] = useState(false);

  // Стан для візуальної анімації скопійованих елементів
  const [copiedType, setCopiedType] = useState<'invite' | 'link' | 'pass' | null>(null);

  const stageUrl = useMemo(() => {
    return `${window.location.origin}/stage-console${shiftId ? `?shift=${shiftId}` : ''}`;
  }, [shiftId]);

  const load = useCallback(async () => {
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

    if (shiftId) {
      const { data: access } = await supabase
        .from('talent_stage_access')
        .select('access_password')
        .eq('shift_id', shiftId)
        .maybeSingle();
      setStagePassword(access?.access_password ?? null);
    }
  }, [shiftId]);

  /** Безпечне копіювання в буфер обміну з підтримкою мобільних вебв'ю */
  const copyToClipboard = async (text: string, type: 'invite' | 'link' | 'pass', toastMsg: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedType(type);
      haptics.notification('success');
      toast.success(toastMsg);
      setTimeout(() => setCopiedType(null), 2200);
    } catch {
      haptics.notification('error');
      toast.error('Не вдалося скопіювати. Спробуйте вручну.');
    }
  };

  /** Створення або перегенерація пароля сцени */
  const createStageLink = async () => {
    setStageBusy(true);
    haptics.impact('light');
    const pass = genStagePassword();
    const { error } = await supabase
      .from('talent_stage_access')
      .upsert({ shift_id: shiftId, access_password: pass }, { onConflict: 'shift_id' });
    setStageBusy(false);
    
    if (error) { 
      haptics.notification('error');
      toast.error('Не вдалося створити доступ для сцени'); 
      return; 
    }
    
    setStagePassword(pass);
    haptics.notification('success');
    toast.success('Пароль для пульта сцени оновлено');
  };

  const copyFullStageInvite = () => {
    if (!stagePassword) return;
    const text = `🎛️ FOH-ПУЛЬТ СЦЕНИ «ВЕЧІР ТАЛАНТІВ»\nПроєкт «Залізна Зміна»\n\n🔗 Посилання: ${stageUrl}\n🔑 Пароль: ${stagePassword}\n\n(Відкрийте посилання на ноутбуці звукорежисера)`;
    copyToClipboard(text, 'invite', 'Повне запрошення для звукорежисера скопійовано');
  };

  /** Зміна паузи (вимірюється виключно кількістю виступів) */
  const setPause = async (entry: TalentEntry, value: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const pause = Math.max(0, Math.min(10, value));
    haptics.impact('light');
    
    setEntries((prev) => 
      prev.map((item) => (item.id === entry.id ? { ...item, break_needed_after: pause, pause_after: pause } : item))
    );

    const { error } = await supabase
      .from('talent_entries')
      .update({ break_needed_after: pause, pause_after: pause })
      .eq('id', entry.id);

    if (error) { 
      toast.error('Не вдалося змінити паузу'); 
      load(); 
    }
  };

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout>;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 500); };
    const ch = supabase.channel('talent-admin-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_entries' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_events' }, debounced)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [load]);

  const startCollecting = async () => {
    setBusy(true);
    haptics.impact('medium');
    const { error } = await supabase.from('talent_events').insert({ shift_id: shiftId, status: 'collecting' });
    setBusy(false);
    if (error) { toast.error('Не вдалося створити подію'); return; }

    await supabase.from('broadcasts').insert({
      message: 'Розпочато збір номерів на Вечір талантів! Супровід може подавати заявки у хабі.',
      color: 'gradient',
      target_teams: [],
      sent_by: 'Штаб проєкту',
    });

    haptics.notification('success');
    toast.success('Збір заявок успішно відкрито');
    load();
  };

  const setStatus = async (status: TalentEvent['status']) => {
    if (!event) return;
    haptics.selection();
    await supabase.from('talent_events').update({ status }).eq('id', event.id);
    load();
  };

  const persistOrder = async (list: TalentEntry[]) => {
    setEntries(list);
    await Promise.all(list.map((e, i) => supabase.from('talent_entries').update({ order_index: i }).eq('id', e.id)));
  };

  const generate = async () => {
    if (!event || entries.length === 0) { 
      toast.error('Немає заявок для формування програми'); 
      return; 
    }
    setBusy(true);
    haptics.impact('medium');
    const ordered = buildRunningOrder(entries);
    await persistOrder(ordered as TalentEntry[]);
    await supabase.from('talent_events').update({ status: 'generated' }).eq('id', event.id);
    setBusy(false);
    haptics.notification('success');
    toast.success('Оптимальний порядок виступів сформовано!');
    load();
  };

  const move = (idx: number, dir: -1 | 1, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = [...entries];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    haptics.impact('light');
    [next[idx], next[to]] = [next[to], next[idx]];
    persistOrder(next);
  };

  const confirmRemove = async () => {
    if (!deleteCandidateId) return;
    haptics.impact('medium');
    await supabase.from('talent_entries').delete().eq('id', deleteCandidateId);
    setDeleteCandidateId(null);
    haptics.notification('success');
    toast.success('Номер видалено зі сценарію');
    load();
  };

  const exportXlsx = () => {
    if (!entries.length) { 
      toast.error('Список номерів порожній'); 
      return; 
    }
    haptics.impact('light');
    const rows = entries.map((e, i) => ({
      '№ з/п': i + 1,
      'Команда': `Команда №${e.team_number}`,
      'Назва номера': e.title,
      'Опис / Учасники / Реквізит': e.description ?? '—',
      'Технічні побажання (звук/світло)': e.technical_notes ?? '—',
      'Пауза після номера': e.break_needed_after ? `${e.break_needed_after} вист.` : '0',
      'Файлів прикріплено': parseAttachments(e.attachments).length,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 34 }, { wch: 40 }, { wch: 30 }, { wch: 20 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Програма Талантів');
    const safeName = (shift?.name || 'Зміна').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Програма_Таланти_${safeName}.xlsx`);
    haptics.notification('success');
    toast.success('Програму експортовано у файл Excel');
  };

  const publish = async () => {
    if (!event) return;
    haptics.impact('heavy');
    await setStatus('finished');
    await supabase.from('broadcasts').insert({
      message: '🎭 Сценарій Вечора талантів опубліковано! Порядок виступів доступний у додатку.',
      color: 'gradient',
      target_teams: [],
      sent_by: 'Штаб проєкту',
    });
    haptics.notification('success');
    toast.success('Сценарій опубліковано для всієї зміни!');
  };

  // Фільтрація номерів при пошуку
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(e => 
      e.title.toLowerCase().includes(q) || 
      e.team_number.toString().includes(q) ||
      (e.description && e.description.toLowerCase().includes(q)) ||
      (e.technical_notes && e.technical_notes.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  const uniqueTeamsCount = useMemo(() => new Set(entries.map((e) => e.team_number)).size, [entries]);
  const totalBreaks = useMemo(() => entries.filter(e => (e.break_needed_after || 0) > 0).length, [entries]);

  /* =========================================================================
     СТАН 1: ПОДІЮ ЩЕ НЕ СТВОРЕНО
  ========================================================================= */
  if (!event) {
    return (
      <Card className="p-6 sm:p-8 bg-[#0A0E18]/90 border border-white/10 text-center space-y-5 shadow-2xl rounded-3xl backdrop-blur-2xl select-none">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shadow-inner">
          <Mic2 className="w-8 h-8 text-[#FA5A15]" />
        </div>
        
        <div className="space-y-1.5">
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
            Вечір талантів
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Створіть подію, щоб відкрити супроводу команд можливість подавати номери, прикріплювати фонограми та сформувати програму сцени.
          </p>
        </div>

        <Button 
          onClick={startCollecting} 
          disabled={busy} 
          className="w-full sm:w-auto sm:min-w-[280px] h-12 font-bold uppercase tracking-wider bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl shadow-lg shadow-[#FA5A15]/20 active:scale-95 transition-all gap-2"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Розпочати збір заявок</span>
            </>
          )}
        </Button>
      </Card>
    );
  }

  const meta = STATUS_META[event.status] ?? STATUS_META.draft;

  /* =========================================================================
     СТАН 2: ГОЛОВНИЙ ПУЛЬТ КЕРУВАННЯ
  ========================================================================= */
  return (
    <div className="space-y-4 select-none pb-8 font-sans">
      <TalentEntryEditDialog 
        entry={editing} 
        open={!!editing} 
        onClose={() => setEditing(null)} 
        onSaved={load} 
      />

      {/* Діалог підтвердження видалення номера */}
      <AlertDialog open={!!deleteCandidateId} onOpenChange={(open) => !open && setDeleteCandidateId(null)}>
        <AlertDialogContent className="max-w-md bg-[#0A0E18]/95 border border-white/10 backdrop-blur-2xl rounded-3xl text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black uppercase text-white">
              Видалити номер зі сценарію?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-slate-400">
              Цей виступ та всі прикріплені до нього аудіотреки буде видалено з програми зміни.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 mt-3">
            <AlertDialogCancel className="h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300">
              Скасувати
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmRemove} 
              className="h-11 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl active:scale-95 transition-all"
            >
              Видалити виступ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Картка статусу події та швидких дій */}
      <Card className="p-4 sm:p-5 bg-[#0A0E18]/90 border border-white/10 space-y-4 shadow-xl rounded-3xl backdrop-blur-2xl">
        
        {/* Заголовок і статус */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shrink-0">
              <Mic2 className="w-5 h-5 text-[#FA5A15]" />
            </div>
            <div className="min-w-0">
              <h1 className="font-black uppercase text-base sm:text-lg tracking-wide text-white truncate">
                {event.title || 'Вечір талантів'}
              </h1>
              <p className="text-[11px] text-slate-400 font-mono">
                Пульт координації сцени
              </p>
            </div>
          </div>

          <Badge className={`text-[11px] px-3 py-1 rounded-xl border flex items-center gap-2 shrink-0 ${meta.cls}`}>
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
            <span className="font-bold">{meta.label}</span>
          </Badge>
        </div>

        {/* Швидка статистика */}
        <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
          <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Всього номерів</span>
            <span className="text-lg sm:text-xl font-black font-mono text-white mt-0.5 block">{entries.length}</span>
          </div>

          <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Команд</span>
            <span className="text-lg sm:text-xl font-black font-mono text-white mt-0.5 block">{uniqueTeamsCount}</span>
          </div>

          <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">З паузами</span>
            <span className="text-lg sm:text-xl font-black font-mono text-amber-400 mt-0.5 block">{totalBreaks}</span>
          </div>
        </div>

        {/* Кнопки керування процесом */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            {event.status !== 'collecting' ? (
              <Button 
                variant="secondary" 
                onClick={() => setStatus('collecting')} 
                className="h-11 text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl active:scale-95 transition-all"
              >
                <Radio className="w-4 h-4 mr-1.5 text-[#FA5A15] animate-pulse" />
                Відкрити збір
              </Button>
            ) : (
              <Button 
                variant="secondary" 
                onClick={() => setStatus('draft')} 
                className="h-11 text-xs font-bold uppercase tracking-wider bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl active:scale-95 transition-all"
              >
                Закрити збір
              </Button>
            )}

            <Button 
              onClick={generate} 
              disabled={busy || entries.length === 0} 
              className="h-11 text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl active:scale-95 transition-all"
            >
              <Wand2 className="w-4 h-4 mr-1.5 text-[#FA5A15]" />
              Сформувати
            </Button>
          </div>

          {/* Публікація */}
          <Button 
            onClick={publish} 
            disabled={entries.length === 0 || event.status === 'finished'} 
            className="w-full h-12 font-black uppercase text-xs tracking-wider bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl shadow-lg shadow-[#FA5A15]/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {event.status === 'finished' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Сценарій опубліковано</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Опублікувати сценарій</span>
              </>
            )}
          </Button>

          {/* Експорт та Нова подія */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button 
              variant="outline" 
              onClick={exportXlsx} 
              disabled={entries.length === 0} 
              className="flex-1 h-10 text-xs font-semibold rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" />
              <span>Експорт Excel</span>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="flex-1 h-10 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-white/5">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" />
                  <span>Новий вечір</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md bg-[#0A0E18]/95 border border-white/10 backdrop-blur-2xl rounded-3xl text-slate-100">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-lg font-black uppercase text-white">
                    Розпочати новий вечір талантів?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs sm:text-sm text-slate-400">
                    Поточну програму буде архівовано, а прийом заявок розпочнеться заново з чистого аркуша.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0 mt-3">
                  <AlertDialogCancel className="h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
                    Скасувати
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={startCollecting} 
                    className="h-11 bg-[#FA5A15] hover:bg-[#FF7D3B] text-white font-bold rounded-xl active:scale-95"
                  >
                    Підтвердити
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

      </Card>

      {/* Пульт сцени та медіа тимчасово вимкнені (STAGE_MEDIA_FEATURE_ENABLED) */}

      {/* Пошук якщо номерів багато */}
      {entries.length > 3 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Пошук виступу за назвою, командою чи нотатками..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-11 text-xs bg-[#0A0E18]/80 border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus-visible:ring-[#FA5A15]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* =========================================================================
          СПИСОК НОМЕРІВ ТА ПОРЯДОК ВИСТУПІВ
      ========================================================================= */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1 text-xs font-mono font-bold uppercase text-slate-400">
          <span>Програма виступів ({filteredEntries.length})</span>
          <span>Керування</span>
        </div>

        {filteredEntries.map((e, i) => {
          const atts = parseAttachments(e.attachments);
          const hasAudio = atts.some((a) => a.type === 'audio' || a.url?.includes('.mp3'));

          return (
            <Card 
              key={e.id} 
              className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 transition-all ${teamAccent(e.team_number)}`}
            >
              {/* Порядковий номер */}
              <div className="w-10 h-10 rounded-xl bg-[#FA5A15] text-white flex items-center justify-center font-mono font-black text-xs shrink-0 tabular-nums shadow-md">
                №{i + 1}
              </div>

              {/* Інформація про виступ */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/40 text-white">
                    Команда #{e.team_number}
                  </span>
                  <h3 className="text-sm font-bold text-white truncate tracking-tight">
                    {e.title}
                  </h3>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-300 mt-1.5">
                  {/* Прикріплені медіафайли */}

                  {/* Пауза вимірюється виключно кількістю виступів */}
                  <span className="inline-flex items-center gap-1.5 bg-amber-500/15 px-2 py-0.5 rounded-lg border border-amber-500/30 text-[11px] text-amber-300 font-semibold">
                    <Coffee className="w-3 h-3 text-amber-400" />
                    <button
                      type="button"
                      onClick={(evt) => setPause(e, (e.break_needed_after || 0) - 1, evt)}
                      aria-label="Зменшити паузу"
                      className="w-5 h-5 rounded flex items-center justify-center bg-black/30 hover:bg-black/50 text-white active:scale-90 transition-all"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="tabular-nums">Пауза: {formatActsCount(e.break_needed_after || 0)}</span>
                    <button
                      type="button"
                      onClick={(evt) => setPause(e, (e.break_needed_after || 0) + 1, evt)}
                      aria-label="Збільшити паузу"
                      className="w-5 h-5 rounded flex items-center justify-center bg-black/30 hover:bg-black/50 text-white active:scale-90 transition-all"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </span>
                </div>

                {e.description && (
                  <p className="text-[11px] text-slate-400 truncate mt-1">
                    👥 {e.description}
                  </p>
                )}
                {e.technical_notes && (
                  <p className="text-[11px] text-amber-300/90 truncate mt-0.5">
                    🎛️ {e.technical_notes}
                  </p>
                )}
              </div>

              {/* Дії: Вгору/Вниз, Редагування, Видалення */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={(evt) => move(i, -1, evt)}
                    disabled={i === 0}
                    aria-label="Перемістити вгору"
                    className="h-6 w-8 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-all disabled:opacity-20 disabled:pointer-events-none"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(evt) => move(i, 1, evt)}
                    disabled={i === entries.length - 1}
                    aria-label="Перемістити вниз"
                    className="h-6 w-8 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-all disabled:opacity-20 disabled:pointer-events-none"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="w-9 h-9 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white active:scale-90" 
                  onClick={() => {
                    haptics.impact('light');
                    setEditing(e);
                  }} 
                  aria-label="Редагувати номер"
                >
                  <Pencil className="w-4 h-4 text-[#FA5A15]" />
                </Button>

                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="w-9 h-9 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 active:scale-90" 
                  onClick={() => {
                    haptics.impact('light');
                    setDeleteCandidateId(e.id);
                  }} 
                  aria-label="Видалити номер"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          );
        })}

        {/* Пустий стан */}
        {entries.length === 0 && (
          <Card className="p-8 text-center bg-[#0A0E18]/80 border border-white/10 space-y-3 rounded-3xl">
            <Clock className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-sm font-bold text-white">Заявок на виступи ще немає</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Супровід команд ще не подав номери. Натисніть «Відкрити збір», щоб команди могли завантажити свої виступи.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TalentAdmin;
