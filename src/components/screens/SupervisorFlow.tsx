import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Users, ArrowLeftRight, Bell, Download, Wallet, CalendarDays, Mic2, Train, ShoppingBag, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { parseTeamNumber } from '@/lib/normalize';
import TeamsView from '@/components/supervisor/TeamsView';
import TransfersView from '@/components/supervisor/TransfersView';
import NotificationsView from '@/components/supervisor/NotificationsView';
import IronBank from '@/components/supervisor/IronBank';
import { exportToExcel } from '@/lib/excel';
import { useHaptics } from '@/hooks/useHaptics';
import { FullScreenLoader } from '@/components/ui/loader';
import ScheduleView from '@/components/schedule/ScheduleView';
import TalentTeamView from '@/components/talent/TalentTeamView';
import CoupeManager from '@/components/coupes/CoupeManager';
import TrainPublishStatus from '@/components/coupes/TrainPublishStatus';
import { TRAIN_TITLE } from '@/lib/trips';
import CoupeSwapSettings from '@/components/coupes/CoupeSwapSettings';
import TabDock, { type DockItem } from '@/components/nav/TabDock';
import { useTalentEventActive } from '@/hooks/useTalentEventActive';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAggressiveFairUnlock } from '@/hooks/useAggressiveFairUnlock';
import SupervisorFairView from '@/components/fair/SupervisorFairView';
import { clearSavedSession, getSavedRole, getSavedTeam, saveSession } from '@/lib/session';
import SupervisorTour, { tourStorageKey } from '@/components/supervisor/SupervisorTour';

interface Props {
  onBack: () => void;
  onAdminUnlock: () => void;
}

const SupervisorFlow = ({ onBack, onAdminUnlock }: Props) => {
  const [team, setTeam] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [authedTeam, setAuthedTeam] = useState<number | null>(null);
  const [showAdminAnim, setShowAdminAnim] = useState(false);

  const [activeTab, setActiveTab] = useState('teams');
  const [unreadCount, setUnreadCount] = useState(0);
  const [bankOpen, setBankOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [openTeam, setOpenTeam] = useState<number | null>(null);
  const [editChild, setEditChild] = useState<any | null>(null);
  const [firstTeamChild, setFirstTeamChild] = useState<any | null>(null);
  
  const haptics = useHaptics();
  const talent = useTalentEventActive();
  const fair = useAggressiveFairUnlock(authedTeam !== null);
  const isMobile = useIsMobile();

  const tabItems: DockItem[] = [
    { value: 'teams', label: 'Команди', icon: Users },
    { value: 'schedule', label: 'Розклад', icon: CalendarDays },
    ...(talent.active ? [{ value: 'talent', label: 'Таланти', icon: Mic2, isNew: talent.isNew } as DockItem] : []),
    ...(fair.hasFairAccess
      ? [{
          value: 'fair',
          label: fair.isLiveFairRunning ? 'Каса відкрита' : 'Ярмарок',
          icon: ShoppingBag,
          accent: 'gold',
          live: fair.isLiveFairRunning,
        } as DockItem]
      : []),
    { value: 'coupes', label: 'Потяг', icon: Train },
    { value: 'transfers', label: 'Трансфери', icon: ArrowLeftRight },
    { value: 'notifications', label: 'Сповіщення', icon: Bell, badge: unreadCount },
  ];

  // Launch the onboarding tour on the supervisor's first entry
  useEffect(() => {
    if (authedTeam === null) return;
    if (localStorage.getItem(tourStorageKey(authedTeam))) return;
    const t = setTimeout(() => setTourOpen(true), 900);
    return () => clearTimeout(t);
  }, [authedTeam]);

  const startTour = () => {
    setActiveTab('teams');
    setEditChild(null);
    setBankOpen(false);
    setTourOpen(true);
  };

  const handleTabChange = (v: string) => {
    if (v === 'talent') talent.markSeen();
    setActiveTab(v);
  };

  // Restore session (only if a real backend session is still valid)
  useEffect(() => {
    const restore = async () => {
      const saved = localStorage.getItem('helpsuprov:supervisor-team')
        ?? (getSavedRole() === 'supervisor' && getSavedTeam() != null ? String(getSavedTeam()) : null);
      if (!saved) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        localStorage.removeItem('helpsuprov:supervisor-team');
        clearSavedSession();
        return;
      }
      setAuthedTeam(parseInt(saved, 10));
    };
    restore();
  }, []);

  // Track unread notifications (per-team, considers both "seen" and "cleared" timestamps)
  useEffect(() => {
    if (authedTeam === null) return;
    const recompute = async () => {
      const seen = localStorage.getItem(`helpsuprov:notif-seen:${authedTeam}`) || '1970-01-01T00:00:00.000Z';
      const cleared = localStorage.getItem(`helpsuprov:notif-cleared:${authedTeam}`) || '1970-01-01T00:00:00.000Z';
      const cutoff = seen > cleared ? seen : cleared;
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', cutoff);
      setUnreadCount(count ?? 0);
    };
    recompute();
    const ch = supabase
      .channel('notif-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => recompute())
      .subscribe();
    // Recompute when storage changes (e.g. after clearing inside NotificationsView)
    const onStorage = () => recompute();
    window.addEventListener('storage', onStorage);
    const interval = setInterval(recompute, 3000);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
  }, [authedTeam]);

  const handleLogin = async () => {
    const teamNum = parseTeamNumber(team);
    if (!teamNum || !password) {
      haptics.notification('error');
      toast.error('Введи команду та пароль');
      return;
    }
    setLoading(true);

    // Credentials are verified server-side; a real backend session is issued on success.
    const { data, error } = await supabase.functions.invoke('staff-login', {
      body: { team: teamNum, password },
    });

    if (error || !data?.session) {
      haptics.notification('error');
      toast.error('Невірний пароль для цієї команди');
      setLoading(false);
      return;
    }

    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (data.role === 'admin') {
      haptics.notification('success');
      saveSession('admin');
      setShowAdminAnim(true);
      setTimeout(() => onAdminUnlock(), 1800);
      return;
    }

    setAuthedTeam(teamNum);
    localStorage.setItem('helpsuprov:supervisor-team', String(teamNum));
    saveSession('supervisor', { teamNumber: teamNum });
    haptics.notification('success');
    toast.success(`Вітаємо, супровід команди #${teamNum}`);
    setLoading(false);
  };

  const logout = async () => {
    setAuthedTeam(null);
    localStorage.removeItem('helpsuprov:supervisor-team');
    clearSavedSession();
    await supabase.auth.signOut();
    onBack();
  };


  const handleExport = async () => {
    const { data, error } = await supabase.from('children').select('*').order('team_number').order('row_number');
    if (error) { toast.error('Помилка експорту'); return; }
    exportToExcel(data || []);
    toast.success('Експортовано');
  };

  if (showAdminAnim) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="animate-admin-reveal text-center">
          <div className="w-32 h-32 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow mx-auto mb-6">
            <span className="text-6xl">👑</span>
          </div>
          <h1 className="text-4xl font-black uppercase mb-2 text-gradient-primary">Адмін</h1>
          <p className="text-muted-foreground">Доступ підтверджено</p>
        </div>
      </div>
    );
  }

  if (authedTeam === null) {
    return (
      <div className="min-h-screen px-4 py-6 max-w-md mx-auto safe-top safe-bottom">
        {loading && <FullScreenLoader label="Перевірка доступу" />}
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground mb-8 hover:text-foreground transition-smooth">
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>

        <div className="animate-slide-up">
          <h1 className="text-3xl font-black uppercase mb-1">Я супровід</h1>
          <p className="text-muted-foreground text-sm mb-8">Авторизація</p>

          <Card className="p-6 bg-gradient-card space-y-5">
            <div className="space-y-2">
              <Label htmlFor="team">Номер команди</Label>
              <Input
                id="team"
                type="number"
                inputMode="numeric"
                placeholder="12"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd">Пароль</Label>
              <Input
                id="pwd"
                type="password"
                placeholder="••••••"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="h-12 text-base"
              />
            </div>
            <Button onClick={handleLogin} disabled={loading} className="w-full h-12 text-base font-bold uppercase">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти'}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] max-w-3xl mx-auto pb-32 safe-bottom overflow-x-hidden">
      <div className="app-bar px-4 py-3 safe-top -mx-0 border-b border-border/40">
        <div className="flex items-center justify-between">
          <button onClick={logout} data-tour="step-8-logout-button" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-smooth min-h-[44px] pr-2">
            <ArrowLeft className="w-4 h-4" /> Вийти
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startTour}
              aria-label="Пройти навчання"
              title="Пройти навчання"
              className="flex items-center gap-1 h-9 px-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-[11px] font-bold active:scale-90 transition-transform"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden xs:inline sm:inline">Навчання</span>
            </button>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Моя команда</p>
              <p className="text-lg font-black text-primary leading-none">#{authedTeam}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full px-3">
        {!isMobile && (
          <div className="sticky top-[60px] z-20 -mx-3 px-3 py-2 bg-background/85 backdrop-blur-md">
            <TabDock items={tabItems} value={activeTab} onChange={handleTabChange} />
          </div>
        )}
        {isMobile && <TabDock items={tabItems} value={activeTab} onChange={handleTabChange} />}

        <TabsContent value="teams" className="mt-3 animate-fade-in">
          <TeamsView
            myTeam={authedTeam}
            openTeam={openTeam}
            onOpenTeamChange={setOpenTeam}
            editChild={editChild}
            onEditChildChange={setEditChild}
            onFirstTeamChild={setFirstTeamChild}
          />
        </TabsContent>
        <TabsContent value="schedule" className="mt-3 animate-fade-in">
          <ScheduleView
            myTeam={authedTeam}
            isStaff
            onFairAction={() => setActiveTab('fair')}
          />
        </TabsContent>
        {talent.active && (
          <TabsContent value="talent" className="mt-3 animate-fade-in">
            <TalentTeamView myTeam={authedTeam} />
          </TabsContent>
        )}
        <TabsContent value="fair" className="mt-3 animate-fade-in">
          <SupervisorFairView myTeam={authedTeam} isLive={fair.isLiveFairRunning} />
        </TabsContent>
        <TabsContent value="coupes" className="mt-3 animate-fade-in">
          <div className="space-y-3">
            <TrainPublishStatus />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1">{TRAIN_TITLE}</p>
            <CoupeSwapSettings myTeam={authedTeam} />
            <CoupeManager myTeam={authedTeam} />
          </div>
        </TabsContent>
        <TabsContent value="transfers" className="mt-3 animate-fade-in">
          <TransfersView myTeam={authedTeam} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-3 animate-fade-in">
          <NotificationsView myTeam={authedTeam} onRestartTour={startTour} />
        </TabsContent>
      </Tabs>

      {/* Floating actions */}
      <div className={`fixed right-4 ${isMobile ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'fab-bottom'} flex flex-col gap-3 animate-slide-in-right z-40`}>

        <Button
          onClick={() => setBankOpen(true)}
          data-tour="step-5-bank-button"
          className="h-14 w-14 rounded-full shadow-glow p-0 bg-gradient-primary tap shine hover:scale-110 transition-spring"
          title="Банк Айрон Доларів"
        >
          <Wallet className="w-6 h-6" />
        </Button>
        <Button
          onClick={handleExport}
          className="export-button-auto-hide h-12 w-12 rounded-full shadow-card p-0 bg-secondary text-foreground hover:bg-secondary/80 tap hover:scale-110 transition-spring"
          title="Експорт в Excel"
        >
          <Download className="w-5 h-5" />
        </Button>
      </div>

      <SupervisorTour
        open={tourOpen}
        teamNumber={authedTeam}
        myTeam={authedTeam}
        activeTab={activeTab}
        firstTeamChild={firstTeamChild}
        onTabChange={setActiveTab}
        setOpenTeam={setOpenTeam}
        setEditChild={setEditChild}
        setBankOpen={setBankOpen}
        onClose={() => setTourOpen(false)}
      />

      {authedTeam !== null && (
        <IronBank
          myTeam={authedTeam}
          open={bankOpen}
          onClose={() => { if (!tourOpen) setBankOpen(false); }}
        />
      )}
    </div>
  );
};

export default SupervisorFlow;
