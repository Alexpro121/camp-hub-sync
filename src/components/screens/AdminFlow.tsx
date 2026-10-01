import { lazyRetry } from '@/lib/lazyRetry';
import { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowLeft, 
  
  
  Calendar, 
  CalendarDays, 
  Mic2, 
  
  
  
  Database, 
  
  
  BarChart3, 
  
  
  Users, 
  
  
  Train, 
  ShoppingBag, 
  
  
  
  
  
  
  Bell,
  
  LayoutDashboard,
  Menu
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { clearSavedSession, saveSession } from '@/lib/session';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TRAIN_FEATURE_ENABLED } from '@/lib/trips';
import { FAIR_FEATURE_ENABLED } from '@/lib/fair';
import { backfillGenders } from '@/lib/gender';
import { ActiveShiftProvider } from '@/context/ActiveShiftContext';
import ActiveShiftSwitcher from '@/components/admin/ActiveShiftSwitcher';
import { getSeenAt } from '@/components/admin/AdminNotificationsView';
import AdminOverview from '@/components/admin/AdminOverview';

const AdminPrintQRCodes = lazyRetry(() => import('@/components/fair/AdminPrintQRCodes'));
const AdminScheduleEditor = lazyRetry(() => import('@/components/schedule/AdminScheduleEditor'));
const TrainTab = lazyRetry(() => import('@/components/admin/TrainTab'));
const TalentAdmin = lazyRetry(() => import('@/components/talent/TalentAdmin'));
const AdminNotificationsView = lazyRetry(() => import('@/components/admin/AdminNotificationsView'));
const AdminTransferApprovals = lazyRetry(() => import('@/components/admin/AdminTransferApprovals'));
const ShiftsTab = lazyRetry(() => import('@/components/admin/tabs/AdminShiftsTab'));
const DataTab = lazyRetry(() => import('@/components/admin/tabs/AdminImportTab'));
const StatsTab = lazyRetry(() => import('@/components/admin/tabs/AdminStatsTab'));
const AdminStaffTab = lazyRetry(() => import('@/components/admin/tabs/AdminStaffTab'));

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
        .in('type', ['transfer', 'swap', 'approval'])
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
           <TabsContent value="notifications" className="mt-3 min-w-0 space-y-3 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminTransferApprovals /><AdminNotificationsView /></TabsContent>
           {TRAIN_FEATURE_ENABLED && (<TabsContent value="coupes" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><TrainTab /></TabsContent>)}
           {FAIR_FEATURE_ENABLED && (<TabsContent value="fair" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminPrintQRCodes /></TabsContent>)}
           <TabsContent value="stats" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><StatsTab /></TabsContent>
           <TabsContent value="staff" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><AdminStaffTab /></TabsContent>
           <TabsContent value="data" className="mt-3 min-w-0 animate-[fade-in_180ms_ease-out] motion-reduce:animate-none"><DataTab /></TabsContent>
          </Suspense>
        </Tabs>
        {mobileNavigation}
      </div>
    </ActiveShiftProvider>
  );
};

export { generateMemorablePassword } from '@/components/admin/tabs/shared';
export default AdminFlow;
