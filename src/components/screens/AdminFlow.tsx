import { lazyRetry } from '@/lib/lazyRetry';
import { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowLeft, 
  Upload, 
  Trash2, 
  Calendar, 
  CalendarDays, 
  Mic2, 
  Wand2, 
  Plus, 
  Loader2, 
  Database, 
  FileSpreadsheet, 
  CheckCircle2, 
  BarChart3, 
  AlertTriangle, 
  Coins, 
  Users, 
  ArrowRightLeft, 
  Link2, 
  Train, 
  ShoppingBag, 
  Copy, 
  Search, 
  ChevronDown, 
  Pencil,
  RefreshCw,
  KeyRound,
  Bell,
  Check,
  LayoutDashboard,
  Menu
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { clearSavedSession, saveSession } from '@/lib/session';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import type { Child, Shift, ShiftType } from '@/types/app';
import ChildEditDialog from '@/components/supervisor/ChildEditDialog';

import type { ImportResult, ImportRow } from '@/lib/importer';
import { shiftStatus } from '@/lib/shift';
import { CATEGORY_LABELS, resolveShiftPhase, teamsOf } from '@/lib/shift-resolver';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FullScreenLoader } from '@/components/ui/loader';
import { TRAIN_FEATURE_ENABLED } from '@/lib/trips';
import { FAIR_FEATURE_ENABLED } from '@/lib/fair';
import { backfillGenders } from '@/lib/gender';
import { normalizeName } from '@/lib/normalize';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { ActiveShiftProvider } from '@/context/ActiveShiftContext';
import ActiveShiftSwitcher from '@/components/admin/ActiveShiftSwitcher';
import { useHaptics } from '@/hooks/useHaptics';
import { getSeenAt } from '@/components/admin/AdminNotificationsView';
import AdminOverview from '@/components/admin/AdminOverview';
import { staffCall, staffErr } from '@/lib/staffApi';

const AdminPrintQRCodes = lazyRetry(() => import('@/components/fair/AdminPrintQRCodes'));
const AdminScheduleEditor = lazyRetry(() => import('@/components/schedule/AdminScheduleEditor'));
const TrainTab = lazyRetry(() => import('@/components/admin/TrainTab'));
const TalentAdmin = lazyRetry(() => import('@/components/talent/TalentAdmin'));
const AdminStaffAccounts = lazyRetry(() => import('@/components/admin/AdminStaffAccounts'));
const AdminNotificationsView = lazyRetry(() => import('@/components/admin/AdminNotificationsView'));
const ImportPreviewDialog = lazyRetry(() => import('@/components/admin/ImportPreviewDialog'));
const MultiFileShiftModal = lazyRetry(() => import('@/components/admin/MultiFileShiftModal'));
const TeamTagInput = lazyRetry(() => import('@/components/admin/TeamTagInput'));
const ShiftEditDialog = lazyRetry(() => import('@/components/admin/ShiftEditDialog'));

/** Кількість непрочитаних сповіщень про трансфери/обміни для бейджа вкладки */
const useUnreadTransfers = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const seen = new Date(getSeenAt() || 0).toISOString();
      const { count: c } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .in('type', ['transfer', 'swap'])
        .gt('created_at', seen);
      if (alive) setCount(c ?? 0);
    };
    load();
    const onSeen = () => setCount(0);
    window.addEventListener('admin-notifications-seen', onSeen);
    const ch = supabase
      .channel('admin-transfers-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => load())
      .subscribe();
    return () => {
      alive = false;
      window.removeEventListener('admin-notifications-seen', onSeen);
      supabase.removeChannel(ch);
    };
  }, []);

  return count;
};

interface Props { onBack: () => void; }


const SHIFT_LABELS: Record<ShiftType, string> = {
  long: 'Довга (12 днів)',
  short: 'Коротка (5 днів)',
  international: 'Міжнародна',
  sports: 'Спортивна зміна',
};

// Словник коротких, позитивних українських слів
const MEMORABLE_UKR_WORDS = [
  'потяг', 'рейка', 'вагон', 'шлях', 'колія', 'ранок', 'вечір',
  'сокіл', 'гори', 'ліс', 'плай', 'рута', 'зірка', 'озеро',
  'стежка', 'сонце', 'бук', 'вогонь', 'вітер', 'небо', 'карпати',
  'залізниця', 'клуб', 'хвиля', 'квітка', 'явір', 'ялина', 'стріла',
  'буковель', 'локомотив', 'пісня', 'друзі', 'сила', 'мрія',
  'світло', 'крила', 'крок', 'драйв', 'іскра', 'сміливість', 'світан'
];

/** Генерація пароля з 2 коротких українських слів у нижньому регістрі через крапку */
export const generateMemorablePassword = (): string => {
  const w1 = MEMORABLE_UKR_WORDS[Math.floor(Math.random() * MEMORABLE_UKR_WORDS.length)];
  let w2 = MEMORABLE_UKR_WORDS[Math.floor(Math.random() * MEMORABLE_UKR_WORDS.length)];
  while (w2 === w1) {
    w2 = MEMORABLE_UKR_WORDS[Math.floor(Math.random() * MEMORABLE_UKR_WORDS.length)];
  }
  return `${w1}.${w2}`;
};

const AdminFlow = ({ onBack }: Props) => {
  useEffect(() => { void backfillGenders(); }, []);
  useEffect(() => { saveSession('admin'); }, []);
  const unreadTransfers = useUnreadTransfers();
  const [tab, setTab] = useState('overview');
  const primaryTabs = [
    { value: 'overview', label: 'Огляд', icon: LayoutDashboard },
    { value: 'shifts', label: 'Зміни', icon: Calendar },
    { value: 'schedule', label: 'Розклад', icon: CalendarDays },
    { value: 'staff', label: 'Супровід', icon: Users },
  ];
  const moreTabs = [
    { value: 'talent', label: 'Таланти', icon: Mic2 },
    { value: 'notifications', label: 'Сповіщення', icon: Bell },
    ...(TRAIN_FEATURE_ENABLED ? [{ value: 'coupes', label: 'Потяг', icon: Train }] : []),
    ...(FAIR_FEATURE_ENABLED ? [{ value: 'fair', label: 'Ярмарок', icon: ShoppingBag }] : []),
    { value: 'stats', label: 'Статистика', icon: BarChart3 },
    { value: 'data', label: 'База', icon: Database },
  ];
  const mobileNavigation = typeof document === 'undefined' ? null : createPortal(
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Розділи адміністратора"
    >
      <div className="grid h-16 w-full grid-cols-5 gap-0.5 px-1">
        {primaryTabs.map(({ value, label, icon: Icon }) => {
          const active = tab === value;
          return (
            <Button
              key={value}
              type="button"
              variant="ghost"
              onClick={() => setTab(value)}
              aria-current={active ? 'page' : undefined}
              className={`h-14 min-w-0 flex-col gap-1 self-center rounded-md px-0 text-[10px] font-medium transition-[color,background-color,transform] duration-150 active:scale-95 motion-reduce:transition-none ${active ? 'bg-muted text-primary' : 'text-muted-foreground'}`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="block w-full truncate px-0.5">{label}</span>
            </Button>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label="Інші розділи"
              className={`relative h-14 min-w-0 flex-col gap-1 self-center rounded-md px-0 text-[10px] transition-[color,background-color,transform] duration-150 active:scale-95 motion-reduce:transition-none ${moreTabs.some(item => item.value === tab) ? 'bg-muted text-primary' : 'text-muted-foreground'}`}
            >
              <Menu className="size-5 shrink-0" />
              <span className="block w-full truncate px-0.5">{moreTabs.find(item => item.value === tab)?.label ?? 'Ще'}</span>
              {unreadTransfers > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-[9px] text-primary-foreground">{unreadTransfers > 99 ? '99+' : unreadTransfers}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-52 max-w-[calc(100vw-1rem)]">
            {moreTabs.map(({ value, label, icon: Icon }) => <DropdownMenuItem key={value} onSelect={() => setTab(value)} className="min-h-11 gap-3"><Icon className="size-4" />{label}{value === 'notifications' && unreadTransfers > 0 && <span className="ml-auto text-primary">{unreadTransfers}</span>}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>,
    document.body,
  );


  const handleExit = async () => {
    clearSavedSession();
    await supabase.auth.signOut();
    onBack();
  };

  return (
    <ActiveShiftProvider>
      <div className="min-h-[100dvh] w-full min-w-0 overflow-x-clip bg-background pb-[calc(5rem+env(safe-area-inset-bottom))] text-foreground select-none sm:pb-16">
        <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 px-3 py-3 backdrop-blur-xl safe-top sm:px-4">
          <div className="mx-auto w-full max-w-5xl min-w-0">
          <div className="flex items-center justify-between">
            <Button variant="ghost"
              onClick={handleExit} 
              className="gap-2 px-2 text-sm text-muted-foreground"
            >
              <ArrowLeft className="w-4 h-4 text-primary" /> 
              <span>Вийти</span>
            </Button>
            <div className="flex items-center gap-2">
              <p className="text-sm sm:text-lg font-bold text-foreground">
                Адмін-панель
              </p>
            </div>
          </div>
          <div className="mt-2">
            <ActiveShiftSwitcher />
          </div>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="mx-auto w-full max-w-5xl min-w-0 px-3 pt-2 sm:px-4">
          <div className="hidden sm:block sticky top-[108px] z-20 -mx-4 px-4 py-2 bg-background/95 overflow-x-auto no-scrollbar">
            <TabsList className="flex h-auto w-full p-1 gap-1 bg-muted border border-border rounded-md">
              {primaryTabs.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="gap-1.5 min-h-11 flex-1 text-xs font-semibold">
                  <Icon className="w-4 h-4" /> <span>{label}</span>
                </TabsTrigger>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={`min-h-11 flex-1 gap-1.5 text-xs ${moreTabs.some(item => item.value === tab) ? 'bg-background text-primary' : 'text-muted-foreground'}`}>
                    <Menu /> {moreTabs.find(item => item.value === tab)?.label ?? 'Ще'} {unreadTransfers > 0 && <span className="rounded-full bg-primary px-1.5 text-primary-foreground">{unreadTransfers > 99 ? '99+' : unreadTransfers}</span>}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {moreTabs.map(({ value, label, icon: Icon }) => <DropdownMenuItem key={value} onSelect={() => setTab(value)} className="min-h-11 gap-3"><Icon className="w-4 h-4" />{label}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </TabsList>
          </div>

           <TabsContent value="overview" className="mt-0 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminOverview onNavigate={setTab} unread={unreadTransfers} /></TabsContent>
          <Suspense fallback={<div className="mt-5 space-y-3" aria-label="Завантаження розділу"><div className="h-16 rounded-md bg-muted animate-pulse" /><div className="h-40 rounded-md bg-muted animate-pulse" /></div>}>
           <TabsContent value="shifts" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><ShiftsTab /></TabsContent>
           <TabsContent value="schedule" className="mt-3 min-w-0 space-y-4 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminScheduleEditor /></TabsContent>
           <TabsContent value="talent" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><TalentAdmin /></TabsContent>
           <TabsContent value="notifications" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminNotificationsView /></TabsContent>
           {TRAIN_FEATURE_ENABLED && (<TabsContent value="coupes" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><TrainTab /></TabsContent>)}
           {FAIR_FEATURE_ENABLED && (<TabsContent value="fair" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminPrintQRCodes /></TabsContent>)}
           <TabsContent value="stats" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><StatsTab /></TabsContent>
           <TabsContent value="staff" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminStaffAccounts /></TabsContent>
           <TabsContent value="data" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><DataTab /></TabsContent>
          </Suspense>
        </Tabs>
        {mobileNavigation}
      </div>
    </ActiveShiftProvider>
  );
};

/* =========================================================================
   ВКЛАДКА 1: КЕРУВАННЯ ЗМІНАМИ ТА ІМПОРТ
========================================================================= */
const ShiftsTab = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ShiftType>('long');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [teams, setTeams] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [multiOpen, setMultiOpen] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const island = useDynamicIsland();

  const load = async () => {
    const { data } = await supabase.from('shifts').select('*').order('start_date', { ascending: false });
    setShifts((data || []) as Shift[]);
    if (data && !data.some(s => !s.deleted_at)) setFormOpen(true);
  };
  useEffect(() => { load(); }, []);

  const addDays = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const computeEnd = (startStr: string, t: ShiftType) => {
    if (!startStr || t === 'international') return '';
    const days = t === 'long' ? 12 : 5;
    const d = new Date(startStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const baseLong = shifts.find((s) => (s.shift_category ?? s.shift_type) === 'long' && !s.deleted_at) ?? null;

  const onTypeChange = (t: ShiftType) => {
    setType(t);
    if ((t === 'short' || t === 'sports') && baseLong) {
      setStart(baseLong.start_date);
      setEnd(baseLong.end_date);
      return;
    }
    const e = computeEnd(start, t);
    if (e) setEnd(e);
  };

  const onStartChange = (v: string) => {
    setStart(v);
    const e = computeEnd(v, type);
    if (e) setEnd(e);
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const reset = () => {
    setName(''); setStart(''); setEnd(''); setFile(null); setSheetUrl('');
    setPreview(null); setSourceLabel('');
    setTeams([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const shiftPayload = () => ({
    name,
    shift_type: type,
    shift_category: type,
    assigned_teams: teams,
    travel_start_date: start || null,
    hotel_start_date: start ? addDays(start, 1) : null,
    start_date: start,
    end_date: end,
    team_offset: 0,
    is_active: true,
  });

  const analyze = async () => {
    if (!name || !start || !end) { toast.error('Заповніть назву та дати зміни'); return; }
    if (!file && !sheetUrl.trim()) { await createOnly(); return; }
    
    setAnalyzing(true);
    island.showExcelProgress(15, file ? file.name : 'Google Sheets');
    try {
      if (sheetUrl.trim()) {
        const { parseSheetUrl } = await import('@/lib/importer');
        if (!parseSheetUrl(sheetUrl)) { toast.error('Некоректне посилання на Google Таблицю'); return; }
      }
      const { analyzeFile, analyzeSheetUrl } = await import('@/lib/importAnalyze');
      const res = file ? await analyzeFile(file) : await analyzeSheetUrl(sheetUrl);
      island.showExcelProgress(70, file ? file.name : 'Google Sheets');
      if (!res.rows.length) { 
        island.hide(); 
        toast.warning('У таблиці не знайдено записів про учасників'); 
        return; 
      }
      setSourceLabel(file ? file.name : sheetUrl.trim());
      setPreview(res);
      if (res.detectedTeams.length) setTeams(res.detectedTeams);
      setPreviewOpen(true);
      island.showExcelProgress(100, file ? file.name : 'Google Sheets');
      setTimeout(() => island.hide(), 700);
    } catch (err: any) {
      island.showError('Помилка імпорту', err.message || 'Не вдалося зчитати таблицю', String(err?.stack || err?.message || err));
      toast.error(err.message || 'Не вдалося зчитати таблицю');
    } finally {
      setAnalyzing(false);
    }
  };

  const syncShortShifts = async (startDate: string, endDate: string) => {
    await supabase
      .from('shifts')
      .update({ start_date: startDate, end_date: endDate, travel_start_date: startDate, hotel_start_date: addDays(startDate, 1) })
      .in('shift_category', ['short', 'sports'])
      .is('deleted_at', null);
  };

  const createOnly = async () => {
    if (!name || !start || !end) { toast.error('Заповніть назву та дати'); return; }
    setCreating(true);
    try {
      const detected = preview?.detectedTeams ?? [];
      const finalTeams = [...new Set([...teams, ...detected])].sort((a, b) => a - b);
      const { data: shift, error: shErr } = await supabase
        .from('shifts')
        .insert({ ...shiftPayload(), assigned_teams: finalTeams })
        .select()
        .single();
      if (shErr || !shift) throw shErr || new Error('Не вдалось створити зміну');
      if (type === 'long') await syncShortShifts(start, end);
      toast.success('Зміну успішно створено');
      reset();
      load();
    } catch (err: any) {
      toast.error(err.message || 'Помилка');
    } finally {
      setCreating(false);
    }
  };

  const confirmImport = async (overrideRows?: ImportRow[]) => {
    if (!preview) return;
    setCreating(true);
    island.showExcelProgress(20, sourceLabel || 'Google Sheets');
    try {
      const { data: shift, error: shErr } = await supabase.from('shifts').insert(shiftPayload()).select().single();
      if (shErr || !shift) throw shErr || new Error('Не вдалось створити зміну');
      if (type === 'long') await syncShortShifts(start, end);

      // Пріоритет — рядки з вікна перегляду (ручне налаштування колонок)
      const sourceRows = overrideRows?.length ? overrideRows : preview.rows;
      const valid = sourceRows.filter(r => r.full_name && r.team_number);
      const { toDbRow } = await import('@/lib/importer');
      const dbRows = valid.map(r => toDbRow(r, shift.id));
      island.showExcelProgress(45, sourceLabel || 'Google Sheets');

      const { data: existing } = await supabase
        .from('children').select('id, full_name, team_number').eq('shift_id', shift.id);
      const map = new Map<string, string>();
      (existing || []).forEach((c: any) => map.set(`${c.team_number}|${normalizeName(c.full_name || '')}`, c.id));

      const toInsert: any[] = [];
      let processed = 0;
      for (const r of dbRows) {
        const id = map.get(`${r.team_number}|${normalizeName(r.full_name)}`);
        if (id) {
          await supabase.from('children').update({
            is_present: r.is_present, row_number: r.row_number, phone: r.phone,
            team_name: r.team_name, note_from_table: r.note_from_table, raw_data: r.raw_data,
          }).eq('id', id);
        } else {
          toInsert.push(r);
        }
        processed++;
        island.showExcelProgress(45 + Math.round((processed / Math.max(1, dbRows.length)) * 45), sourceLabel || 'Google Sheets');
      }
      if (toInsert.length) {
        const { error: insErr } = await supabase.from('children').insert(toInsert);
        if (insErr) throw insErr;
        void backfillGenders();
      }

      await supabase.from('uploaded_files').insert({
        filename: sourceLabel || 'Google Sheets',
        shift_id: shift.id,
        rows_count: valid.length,
      });

      island.showExcelProgress(100, sourceLabel || 'Google Sheets');
      island.showSuccess('Зміну успішно імпортовано!', `${valid.length} учасників додано`);
      toast.success(`Зміну створено · імпортовано ${valid.length} учасників`);
      setPreviewOpen(false);
      reset();
      load();
    } catch (err: any) {
      island.showError('Помилка імпорту', err.message || 'Спробуйте ще раз', String(err?.stack || err?.message || err));
      toast.error(err.message || 'Помилка');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    const { data: kids } = await supabase.from('children').select('id').eq('shift_id', id);
    const childIds = (kids || []).map((k: any) => k.id);
    if (childIds.length) {
      await supabase.from('transfers').delete().in('child_id', childIds);
    }
    await supabase.from('children').delete().eq('shift_id', id);
    await supabase.from('uploaded_files').delete().eq('shift_id', id);
    await supabase.from('shifts').delete().eq('id', id);
    load();
    toast.success('Зміну видалено разом із даними');
  };

  return (
    <div className="space-y-4">
      {creating && <FullScreenLoader label={preview ? 'Імпорт таблиці...' : 'Створення зміни...'} />}
      {analyzing && <FullScreenLoader label="Аналіз структури таблиці..." />}
      {previewOpen && <Suspense fallback={null}><ImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        result={preview}
        busy={creating}
        onConfirm={confirmImport}
      /></Suspense>}
      {multiOpen && <Suspense fallback={null}><MultiFileShiftModal open={multiOpen} onOpenChange={setMultiOpen} onCreated={load} /></Suspense>}
      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-xl font-bold">Зміни</h2>
        <Button size="sm" onClick={() => setFormOpen(v => !v)} aria-expanded={formOpen} className="shrink-0">
          {formOpen ? <ChevronDown className="rotate-180" /> : <Plus />} {formOpen ? 'Згорнути' : 'Створити'}
        </Button>
      </div>
      <div className="space-y-2">
        {shifts.filter(s => !s.deleted_at).length === 0 ? (
          <p className="py-5 text-sm text-muted-foreground">Немає зареєстрованих змін</p>
        ) : shifts.filter(s => !s.deleted_at && (showPast || shiftStatus(s) !== 'finished')).map(s => (
          <ShiftRow key={s.id} shift={s} onDelete={() => remove(s.id)} onChanged={load} />
        ))}
        {shifts.some(s => !s.deleted_at && shiftStatus(s) === 'finished') && (
          <Button variant="ghost" className="w-full justify-center text-muted-foreground" onClick={() => setShowPast(v => !v)}>
            <ChevronDown className={showPast ? 'rotate-180' : ''} /> {showPast ? 'Сховати минулі' : `Минулі зміни (${shifts.filter(s => !s.deleted_at && shiftStatus(s) === 'finished').length})`}
          </Button>
        )}
      </div>
      {formOpen && (
      <Card className="p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-3xl space-y-3 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold uppercase text-xs tracking-wider text-[#FA5A15]">
            Створити зміну та імпортувати учасників
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMultiOpen(true)}
            className="h-8 shrink-0 rounded-xl border-white/15 text-[10px] font-bold uppercase tracking-wider"
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> Мульти-імпорт
          </Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Назва зміни</Label>
            <Input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Зміна #1 · Карпати" 
              className="h-11 rounded-xl bg-white/5 border-white/10 text-white" 
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Тип зміни</Label>
            <Select value={type} onValueChange={(v) => onTypeChange(v as ShiftType)}>
              <SelectTrigger className="h-11 rounded-xl bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#0F1523] border-white/10 text-white">
                <SelectItem value="long">{SHIFT_LABELS.long}</SelectItem>
                <SelectItem value="short">{SHIFT_LABELS.short}</SelectItem>
                <SelectItem value="sports">{SHIFT_LABELS.sports}</SelectItem>
                <SelectItem value="international">{SHIFT_LABELS.international}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Початок</Label>
              <Input 
                type="date" 
                value={start} 
                disabled={(type === 'short' || type === 'sports') && !!baseLong} 
                onChange={e => onStartChange(e.target.value)} 
                className="h-11 rounded-xl bg-white/5 border-white/10 text-white" 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Кінець <span className="text-[#FA5A15]">(авто)</span></Label>
              <Input 
                type="date" 
                value={end} 
                disabled={(type === 'short' || type === 'sports') && !!baseLong} 
                onChange={e => setEnd(e.target.value)} 
                className="h-11 rounded-xl bg-white/5 border-white/10 text-white" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Команди зміни</Label>
            <Suspense fallback={<div className="h-11 rounded-md bg-muted animate-pulse" />}><TeamTagInput value={teams} onChange={setTeams} /></Suspense>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!preview?.detectedTeams.length}
              onClick={() => {
                const detected = preview?.detectedTeams ?? [];
                setTeams(detected);
                toast.success(`Визначено команди: ${detected.map((t) => `№${t}`).join(', ')}`);
              }}
              className="h-9 text-xs rounded-xl bg-white/10 hover:bg-white/15 text-white"
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" /> Автовизначити команди з файлу
            </Button>
          </div>

          {/* Завантаження файлу */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs text-slate-300">Варіант А · Файл Excel (.xlsx / .xls / .csv)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFilePick}
              className="hidden"
              id="shift-file-up"
            />
            <label
              htmlFor="shift-file-up"
              className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                file ? 'border-[#FA5A15]/60 bg-[#FA5A15]/10' : 'border-white/10 hover:border-[#FA5A15]/40 bg-white/[0.02]'
              }`}
            >
              {file ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-[#FA5A15] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-white">{file.name}</p>
                    <p className="text-[11px] text-slate-400">Файл готовий до аналізу</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.preventDefault(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="shrink-0 text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-[#FA5A15]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-200">Обрати файл списку</p>
                    <p className="text-[11px] text-slate-400">Стовпці: № Команди, ПІБ, Телефон, Наявність тощо</p>
                  </div>
                </>
              )}
            </label>
          </div>

          {/* Google Sheets */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Варіант Б · Посилання на Google Таблицю</Label>
            <div className="relative">
              <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="h-11 pl-9 text-xs rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                disabled={!!file}
              />
            </div>
          </div>

          <Button 
            onClick={analyze} 
            disabled={creating || analyzing} 
            className="w-full h-12 font-bold uppercase rounded-xl bg-[#FA5A15] hover:bg-[#FF7D3B] text-white shadow-lg active:scale-[0.98] transition-transform mt-2"
          >
            {creating || analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : (file || sheetUrl.trim())
              ? <><Wand2 className="w-4 h-4 mr-2" /> Аналізувати структуру таблиці</>
              : <><Plus className="w-4 h-4 mr-2" /> Створити зміну</>}
          </Button>
        </div>
      </Card>
      )}
    </div>
  );
};

const ShiftRow = ({ shift: s, onDelete, onChanged }: { shift: Shift; onDelete: () => void; onChanged: () => void }) => {
  const [count, setCount] = useState<number | null>(null);
  const [copyingInvite, setCopyingInvite] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    (async () => {
      const { count: c } = await supabase.from('children').select('id', { count: 'exact', head: true }).eq('shift_id', s.id);
      setCount(c ?? 0);
    })();
  }, [s.id]);

  const status = shiftStatus(s);
  const copyStaffInvite = async () => {
    setCopyingInvite(true);
    try {
      const { invite } = await staffCall<{ invite: { token: string } }>({ action: 'shift_invite_create', shift_id: s.id });
      await navigator.clipboard.writeText(`${window.location.origin}/staff/join/${invite.token}`);
      toast.success('Посилання для супроводу скопійовано');
    } catch (error) {
      toast.error(staffErr(error));
    } finally {
      setCopyingInvite(false);
    }
  };
  const statusMeta: Record<typeof status, { label: string; cls: string }> = {
    active:   { label: 'Активна',   cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    upcoming: { label: 'Майбутня',  cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    finished: { label: 'Завершена', cls: 'bg-white/5 text-slate-400 border-white/10' },
  };

  return (
    <Card className="p-3.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-[#0F1523]/80 border border-white/10 rounded-2xl shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center shrink-0">
        <Calendar className="w-4 h-4 text-[#FA5A15]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-bold truncate text-white">{s.name}</p>
          <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${statusMeta[status].cls}`}>
            {statusMeta[status].label}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {SHIFT_LABELS[(s.shift_category ?? s.shift_type) as ShiftType] ?? SHIFT_LABELS[s.shift_type]} · {s.start_date} → {s.end_date}
        </p>
        <p className="text-[11px] text-slate-500">
          Команди: {teamsOf(s).join(', ') || '—'} · {resolveShiftPhase(s).phaseTitle}
        </p>
        <p className="text-[11px] text-[#FA5A15] font-semibold mt-0.5 flex items-center gap-1">
          <FileSpreadsheet className="w-3 h-3" /> {count ?? '...'} учасників
        </p>
      </div>

      <div className="col-span-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-t border-white/10 pt-3">
        <Button variant="secondary" className="min-w-0 justify-center" onClick={() => setEditOpen(true)}>
          <Wand2 className="size-4" /> Редагувати
        </Button>
        <Button variant="secondary" className="min-w-0 justify-center" disabled={copyingInvite} onClick={copyStaffInvite}>
          {copyingInvite ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} <span className="truncate">Супровід</span>
        </Button>
        {editOpen && <Suspense fallback={null}><ShiftEditDialog shift={s} open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} /></Suspense>}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="shrink-0 text-slate-400 hover:text-rose-400">
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-[#0F1523] border-white/10 text-white rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Видалити зміну «{s.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400 space-y-1">
              Будуть безповоротно видалені всі {count ?? '…'} учасників цієї зміни, їхні транзакції та історія переведень.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-slate-300 rounded-xl text-xs">Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold">
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Card>
  );
};

/* =========================================================================
   ВКЛАДКА 2: БАЗА ДАНИХ ТА ГЕНЕРАТОР ПАРОЛІВ СУПРОВОДУ
========================================================================= */
const DataTab = () => {
  const [count, setCount] = useState(0);
  const [teamsCount, setTeamsCount] = useState(0);
  const [passwords, setPasswords] = useState<Array<{ team: number; password: string; is_custom?: boolean }> | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwFilter, setPwFilter] = useState('');
  
  // Стейт діалогу редагування пароля
  const [editDialogTeam, setEditDialogTeam] = useState<number | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const haptics = useHaptics();

  const load = async () => {
    const { data } = await supabase.from('children').select('team_number');
    setCount(data?.length || 0);
    setTeamsCount(new Set((data || []).map((d: any) => d.team_number)).size);
  };
  useEffect(() => { load(); }, []);

  // Завантаження паролів — єдине джерело правди - база через Edge Function.
  // Жодних локальних «дефолтних» підстановок: вони показували неробочі паролі.
  const loadPasswords = async (silent = false) => {
    setPwLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('staff-login', {
        body: { action: 'list_team_passwords' },
      });

      if (error || !data?.passwords || !Array.isArray(data.passwords)) {
        throw new Error(data?.error || error?.message || 'load_failed');
      }

      setPasswords(data.passwords);
    } catch {
      if (!silent) toast.error('Не вдалося отримати паролі з бази. Спробуйте ще раз.');
    } finally {
      setPwLoading(false);
    }
  };

  const copyAll = async () => {
    if (!passwords?.length) return;
    const text = passwords.map((p) => `Команда №${p.team}: ${p.password}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      haptics.impact('light');
      toast.success('Усі паролі скопійовано в буфер');
    } catch {
      toast.error('Не вдалося скопіювати');
    }
  };

  const copySingle = (p: { team: number; password: string }) => {
    navigator.clipboard.writeText(p.password);
    haptics.impact('light');
    toast.success(`Пароль для команди №${p.team} скопійовано`);
  };

  // ✅ Збереження пароля через Edge Function (upsert у таблицю team_passwords)
  const savePassword = async (teamNum: number, newPass: string) => {
    const trimmed = newPass.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!trimmed) {
      toast.error('Пароль не може бути порожнім');
      return;
    }

    setSavingPw(true);
    try {
      const { data, error } = await supabase.functions.invoke('staff-login', {
        body: {
          action: 'update_team_password',
          team: teamNum,
          password: trimmed,
        },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || 'save_failed');
      }

      // Показуємо рівно те, що підтвердила база (readback), а не локальне припущення
      const effective: string = data.password ?? trimmed;
      setPasswords((prev) => {
        const row = { team: teamNum, password: effective, is_custom: true };
        if (!prev) return [row];
        const exists = prev.some((p) => p.team === teamNum);
        if (exists) return prev.map((p) => (p.team === teamNum ? { ...p, ...row } : p));
        return [...prev, row].sort((a, b) => a.team - b.team);
      });

      haptics.notification('success');
      toast.success(`Пароль для команди №${teamNum} оновлено: ${effective}`);
      setEditDialogTeam(null);

      // Повторна синхронізація зі списком у базі (гарантія, що адмін бачить робочий пароль)
      void loadPasswords(true);
    } catch (err: any) {
      haptics.notification('error');
      toast.error(err.message || 'Помилка збереження пароля');
    } finally {
      setSavingPw(false);
    }
  };

  // Швидка автогенерація 2 укр слів через крапку в 1 клік
  const quickRegenerate = async (teamNum: number) => {
    haptics.impact('light');
    const newPass = generateMemorablePassword();
    await savePassword(teamNum, newPass);
  };

  const filtered = (passwords || []).filter((p) =>
    !pwFilter.trim() || String(p.team).includes(pwFilter.replace(/[^\d]/g, '')),
  );

  const wipe = async () => {
    await supabase.from('children').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('transfers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    haptics.notification('success');
    toast.success('Базу успішно очищено');
    load();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 sm:p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Учасників у базі</p>
          <p className="text-3xl sm:text-4xl font-black mt-1 text-[#FA5A15] font-mono tabular-nums">{count}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Команд</p>
          <p className="text-3xl sm:text-4xl font-black mt-1 text-white font-mono tabular-nums">{teamsCount}</p>
        </Card>
      </div>

      {/* Блок паролів супроводу */}
      <Card className="p-4 sm:p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-3xl space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-bold tracking-wider text-white flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#FA5A15]" />
              Паролі супроводу
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Формат автогенерації: <code className="text-[#FA5A15] font-mono">слово.слово</code> (2 укр слова через крапку)
            </p>
          </div>
        </div>

        {!passwords ? (
          <Button 
            onClick={() => loadPasswords()} 
            disabled={pwLoading} 
            className="w-full h-11 font-bold uppercase rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10"
          >
            {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2 text-[#FA5A15]" />}
            {pwLoading ? 'Завантаження...' : 'Показати паролі команд'}
          </Button>
        ) : (
          <div className="space-y-2.5 animate-slide-up">
            <div className="flex items-center gap-2">
              <Button 
                onClick={copyAll} 
                variant="outline" 
                className="h-10 text-xs font-bold rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 flex-1"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" /> Копіювати всі паролі
              </Button>
              <Button
                onClick={() => {
                  const pass = generateMemorablePassword();
                  navigator.clipboard.writeText(pass);
                  haptics.impact('light');
                  toast.success(`Згенеровано приклад: ${pass} (скопійовано)`);
                }}
                variant="outline"
                className="h-10 px-3 text-xs font-bold rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 shrink-0"
                title="Згенерувати випадковий приклад"
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
              </Button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={pwFilter}
                onChange={(e) => setPwFilter(e.target.value)}
                inputMode="numeric"
                placeholder="Пошук за номером команди..."
                className="h-10 pl-9 text-xs rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {filtered.map((p) => (
                <div 
                  key={p.team} 
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 px-3 py-2 transition-colors"
                >
                  <span className="text-xs font-bold font-mono text-white shrink-0 min-w-[36px]">
                    #{p.team}
                  </span>

                  <span className="text-xs font-mono font-bold text-[#FA5A15] tracking-wider truncate flex-1 text-center bg-black/30 py-1 px-2 rounded-lg border border-white/5">
                    {p.password}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Автогенерація в 1 клік */}
                    <button
                      type="button"
                      onClick={() => quickRegenerate(p.team)}
                      disabled={savingPw}
                      className="p-1.5 hover:bg-white/10 active:scale-90 rounded-lg transition-all text-slate-400 hover:text-amber-400 disabled:opacity-50"
                      title="Перегенерувати 2 укр слова"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    {/* Ручне редагування */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditDialogTeam(p.team);
                        setCustomPassword(p.password);
                      }}
                      className="p-1.5 hover:bg-white/10 active:scale-90 rounded-lg transition-all text-slate-400 hover:text-white"
                      title="Редагувати або вписати свій пароль"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Копіювання */}
                    <button
                      type="button"
                      onClick={() => copySingle(p)}
                      className="p-1.5 hover:bg-white/10 active:scale-90 rounded-lg transition-all text-slate-400 hover:text-emerald-400"
                      title="Скопіювати пароль"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">Команд не знайдено</p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Діалог редагування/генерації пароля */}
      {editDialogTeam !== null && (
        <Dialog open={editDialogTeam !== null} onOpenChange={(open) => !open && setEditDialogTeam(null)}>
          <DialogContent className="bg-[#0F1523] border border-white/10 text-white rounded-3xl max-w-sm mx-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <KeyRound className="w-5 h-5 text-[#FA5A15]" />
                Пароль Команди №{editDialogTeam}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Введіть свій пароль або натисніть чарівну паличку для генерації 2 слів.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Пароль команди</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value.toLowerCase())}
                    placeholder="потяг.гори"
                    className="h-11 rounded-xl bg-white/5 border-white/10 text-white font-mono text-sm"
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      haptics.impact('light');
                      setCustomPassword(generateMemorablePassword());
                    }}
                    variant="outline"
                    className="h-11 px-3 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-[#FA5A15] shrink-0"
                    title="Згенерувати 2 укр слова"
                  >
                    <Wand2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                variant="ghost"
                onClick={() => setEditDialogTeam(null)}
                className="rounded-xl border border-white/10 bg-white/5 text-slate-300 text-xs"
              >
                Скасувати
              </Button>
              <Button
                onClick={() => savePassword(editDialogTeam, customPassword)}
                disabled={savingPw}
                className="bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl text-xs font-bold"
              >
                {savingPw ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                Зберегти пароль
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full h-12 font-bold uppercase rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 mt-4">
            <Trash2 className="w-4 h-4 mr-2" /> Очистити базу учасників
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-[#0F1523] border border-white/10 text-white rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Видалити всіх учасників?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400">
              Це безповоротно видалить усіх учасників, баланси, історію переведень та сповіщення. Самі зміни залишаться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-slate-300 rounded-xl text-xs">Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={wipe} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold">
              Так, очистити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/* =========================================================================
   ВКЛАДКА 3: СТАТИСТИКА ЗМІН
========================================================================= */
interface ShiftStats {
  shift: Shift;
  total: number;
  present: number;
  loggedIn: number;
  ironTotal: number;
  teams: number;
  transfers: number;
}

const StatsTab = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ShiftStats[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [orphans, setOrphans] = useState<{ total: number; teams: number; iron: number } | null>(null);
  const [editing, setEditing] = useState<Child | null>(null);

  const load = async () => {
    const [{ data: shifts }, { data: kids }, { data: trans }] = await Promise.all([
      supabase.from('shifts').select('*').order('start_date', { ascending: false }),
      supabase.from('children').select('*').order('team_number'),
      supabase.from('transfers').select('child_id'),
    ]);

    const transfersByChild = new Map<string, number>();
    (trans || []).forEach((t: any) => {
      transfersByChild.set(t.child_id, (transfersByChild.get(t.child_id) || 0) + 1);
    });

    const stats: ShiftStats[] = (shifts || []).map((s: any) => {
      const inShift = (kids || []).filter((c: any) => c.shift_id === s.id);
      let transfers = 0;
      inShift.forEach((c: any) => { transfers += transfersByChild.get(c.id) || 0; });
      return {
        shift: s as Shift,
        total: inShift.length,
        present: inShift.filter((c: any) => c.is_present).length,
        loggedIn: inShift.filter((c: any) => c.has_logged_in).length,
        ironTotal: inShift.reduce((sum: number, c: any) => sum + (c.iron_dollars || 0), 0),
        teams: new Set(inShift.map((c: any) => c.team_number)).size,
        transfers,
      };
    });

    const orphanKids = (kids || []).filter((c: any) => !c.shift_id);
    setOrphans(orphanKids.length ? {
      total: orphanKids.length,
      teams: new Set(orphanKids.map((c: any) => c.team_number)).size,
      iron: orphanKids.reduce((s: number, c: any) => s + (c.iron_dollars || 0), 0),
    } : null);

    setChildren((kids || []) as Child[]);
    setRows(stats);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { void load(); }, 300);
    };
    const ch = supabase.channel('stats-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      void supabase.removeChannel(ch);
    };
  }, []);

  if (loading) {
    return <Card className="p-8 text-center bg-[#0F1523]/80 border-white/10 rounded-2xl"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#FA5A15]" /></Card>;
  }

  if (rows.length === 0 && !orphans) {
    return (
      <Card className="p-8 text-center bg-[#0F1523]/80 border-white/10 rounded-2xl">
        <BarChart3 className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <p className="text-sm text-slate-400">Немає даних для аналізу</p>
      </Card>
    );
  }

  const totalKids = rows.reduce((s, r) => s + r.total, 0) + (orphans?.total || 0);
  const totalIron = rows.reduce((s, r) => s + r.ironTotal, 0) + (orphans?.iron || 0);
  const totalTransfers = rows.reduce((s, r) => s + r.transfers, 0);
  const orphanKids = children.filter((c) => !c.shift_id);

  return (
    <div className="space-y-3">
      {editing && (
        <ChildEditDialog child={editing} open={!!editing} onClose={() => setEditing(null)} />
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatBox icon={<Users className="w-3.5 h-3.5" />} label="Учасників" value={totalKids} />
        <StatBox icon={<Coins className="w-3.5 h-3.5" />} label="А$" value={totalIron} />
        <StatBox icon={<ArrowRightLeft className="w-3.5 h-3.5" />} label="Трансферів" value={totalTransfers} />
      </div>

      <h3 className="font-bold uppercase text-xs tracking-wider text-slate-400 px-1 pt-2">По змінах</h3>
      {rows.map((r) => (
        <ShiftStatsCard
          key={r.shift.id}
          stats={r}
          kids={children.filter((c) => c.shift_id === r.shift.id)}
          onPickChild={setEditing}
        />
      ))}

      {orphans && (
        <Card className="p-4 bg-[#0F1523]/60 border border-dashed border-white/15 rounded-2xl space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Поза змінами
            </p>
          </div>
          <p className="text-xs text-slate-400">
            {orphans.total} учасників у {orphans.teams} командах · {orphans.iron} А$. Не прив'язані до конкретної зміни.
          </p>
          <ChildPickList kids={orphanKids} onPick={setEditing} />
        </Card>
      )}
    </div>
  );
};

const ChildPickList = ({ kids, onPick }: { kids: Child[]; onPick: (c: Child) => void }) => {
  if (!kids.length) return null;
  return (
    <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
      {kids.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c)}
          className="w-full flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 text-left hover:border-[#FA5A15]/40 active:scale-[0.99] transition-all"
        >
          <span className="text-[10px] font-black font-mono tabular-nums w-8 shrink-0 text-slate-400">#{c.team_number}</span>
          <span className="text-xs font-semibold truncate flex-1 text-slate-200">{c.full_name}</span>
          <span className="text-xs font-mono font-bold text-[#FA5A15] shrink-0">{c.iron_dollars} А$</span>
          <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      ))}
    </div>
  );
};

const formatTeams = (teams: number[]): string => {
  if (!teams.length) return '—';
  const sorted = [...teams].sort((a, b) => a - b);
  const parts: string[] = [];
  let s = sorted[0], p = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i];
    if (n === p + 1) { p = n; continue; }
    parts.push(s === p ? String(s) : `${s}-${p}`);
    s = n; p = n;
  }
  return parts.join(', ');
};

const StatBox = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <Card className="p-3 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl">
    <div className="flex items-center gap-1 text-slate-400">
      {icon}
      <p className="text-[10px] uppercase font-bold tracking-wider">{label}</p>
    </div>
    <p className="text-xl sm:text-2xl font-black text-[#FA5A15] font-mono tabular-nums mt-1">{value}</p>
  </Card>
);

const ShiftStatsCard = ({ stats: r, kids = [], onPickChild }: { stats: ShiftStats; kids?: Child[]; onPickChild?: (c: Child) => void }) => {
  const [showKids, setShowKids] = useState(false);
  const status = shiftStatus(r.shift);
  const statusMeta: Record<typeof status, { label: string; cls: string }> = {
    active:   { label: 'Активна',   cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    upcoming: { label: 'Майбутня',  cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
    finished: { label: 'Завершена', cls: 'bg-white/5 text-slate-400 border-white/10' },
  };
  const presentPct = r.total ? Math.round((r.present / r.total) * 100) : 0;
  const loggedPct = r.total ? Math.round((r.loggedIn / r.total) * 100) : 0;

  return (
    <Card className="p-4 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl space-y-3 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold truncate text-white">{r.shift.name}</p>
            <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${statusMeta[status].cls}`}>
              {statusMeta[status].label}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {SHIFT_LABELS[r.shift.shift_type]} · {r.shift.start_date} → {r.shift.end_date}
          </p>
          <p className="text-[11px] text-[#FA5A15] font-medium mt-0.5">
            {CATEGORY_LABELS[resolveShiftPhase(r.shift).category]} (Команди: {formatTeams(teamsOf(r.shift))}): {r.total} учасників
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Учасників" value={r.total} />
        <MiniStat label="Команд" value={r.teams} />
        <MiniStat label="Присутні" value={`${r.present}`} hint={`${presentPct}%`} />
        <MiniStat label="Увійшли" value={`${r.loggedIn}`} hint={`${loggedPct}%`} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Баланс А$" value={`${r.ironTotal} А$`} accent />
        <MiniStat label="Трансферів" value={r.transfers} />
      </div>

      {kids.length > 0 && onPickChild && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowKids((v) => !v)}
            className="w-full h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showKids ? 'rotate-180' : ''}`} />
            {showKids ? 'Сховати список' : `Переглянути учасників (${kids.length})`}
          </button>
          {showKids && (
            <div className="pt-2 animate-slide-up">
              <ChildPickList kids={kids} onPick={onPickChild} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const MiniStat = ({ label, value, hint, accent }: { label: string; value: number | string; hint?: string; accent?: boolean }) => (
  <div className="rounded-xl bg-white/[0.03] p-2 border border-white/5">
    <p className="text-[9px] uppercase font-bold tracking-wider text-slate-400">{label}</p>
    <div className="flex items-baseline gap-1 mt-0.5">
      <p className={`text-base sm:text-lg font-black font-mono tabular-nums leading-none ${accent ? 'text-[#FA5A15]' : 'text-white'}`}>
        {value}
      </p>
      {hint && <span className="text-[9px] text-slate-400 font-mono tabular-nums">{hint}</span>}
    </div>
  </div>
);

export default AdminFlow;
