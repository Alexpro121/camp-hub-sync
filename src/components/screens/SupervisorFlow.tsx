import { useEffect, useState, useCallback } from 'react';
import { 
  ArrowLeft, 
  Loader2, 
  Users, 
  ArrowLeftRight, 
  Bell, 
  Download, 
  Wallet, 
  CalendarDays, 
  Mic2, 
  Train, 
  ShoppingBag, 
  HelpCircle,
  Crown,
  Sun,
  Moon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
import { TRAIN_TITLE, TRAIN_FEATURE_ENABLED } from '@/lib/trips';
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

  // Керування темою оформлення для кабінету супроводу
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('supervisor_theme_mode');
    return saved ? saved === 'dark' : true;
  });
  
  const haptics = useHaptics();
  const talent = useTalentEventActive();
  const fair = useAggressiveFairUnlock(authedTeam !== null);
  const isMobile = useIsMobile();

  // Синхронізація теми з документом
  useEffect(() => {
    localStorage.setItem('supervisor_theme_mode', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    haptics.impact('light');
    setIsDark((prev) => !prev);
  }, [haptics]);

  // Список вкладок для нижнього плаваючого Dock
  const tabItems: DockItem[] = [
    { value: 'teams', label: 'Команди', icon: Users },
    { value: 'schedule', label: 'Розклад', icon: CalendarDays },
    ...(talent.active ? [{ value: 'talent', label: 'Таланти', icon: Mic2, isNew: talent.isNew } as DockItem] : []),
    ...(fair.hasFairAccess
      ? [{
          value: 'fair',
          label: fair.isLiveFairRunning ? 'Каса (Air Pay)' : 'Ярмарок',
          icon: ShoppingBag,
          accent: 'gold',
          live: fair.isLiveFairRunning,
        } as DockItem]
      : []),
    ...(TRAIN_FEATURE_ENABLED ? [{ value: 'coupes', label: 'Потяг', icon: Train } as DockItem] : []),
    { value: 'transfers', label: 'Трансфери', icon: ArrowLeftRight },
    { value: 'notifications', label: 'Сповіщення', icon: Bell, badge: unreadCount },
  ];

  // Автоматично відкриваємо свою команду за замовчуванням
  useEffect(() => {
    if (authedTeam !== null) setOpenTeam(authedTeam);
  }, [authedTeam]);

  // Автоматичний запуск навчального туру для нового супроводу
  useEffect(() => {
    if (authedTeam === null) return;
    const GLOBAL_SEEN_KEY = 'helpsuprov:tour-seen-global';
    const teamKey = tourStorageKey(authedTeam);
    if (localStorage.getItem(teamKey) || localStorage.getItem(GLOBAL_SEEN_KEY)) return;
    
    localStorage.setItem(teamKey, 'true');
    localStorage.setItem(GLOBAL_SEEN_KEY, 'true');
    const t = setTimeout(() => setTourOpen(true), 900);
    return () => clearTimeout(t);
  }, [authedTeam]);

  const startTour = useCallback(() => {
    haptics.impact('light');
    setActiveTab('teams');
    setEditChild(null);
    setBankOpen(false);
    setTourOpen(true);
  }, [haptics]);

  const handleTabChange = (v: string) => {
    haptics.impact('light');
    if (v === 'talent') talent.markSeen();
    setActiveTab(v);
  };

  // Відновлення сесії супроводу
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

  // Відстеження та миттєве скидання нечитаних сповіщень
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

    // Слухаємо системні події оновлення стрічки
    const onStorage = () => recompute();
    window.addEventListener('storage', onStorage);
    window.addEventListener('helpsuprov:notif-sync', onStorage);
    const interval = setInterval(recompute, 15000);

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('helpsuprov:notif-sync', onStorage);
      clearInterval(interval);
    };
  }, [authedTeam]);

  // Авторизація супроводу
  const handleLogin = async () => {
    const teamNum = parseTeamNumber(team);
    if (!teamNum || !password) {
      haptics.notification('error');
      toast.error('Введіть номер команди та пароль');
      return;
    }
    setLoading(true);

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
    toast.success(`Вітаємо, супровід Команди №${teamNum}!`);
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
    haptics.impact('light');
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .order('team_number')
      .order('row_number');

    if (error) { 
      toast.error('Помилка експорту списку'); 
      return; 
    }
    exportToExcel(data || []);
    toast.success('Список успішно експортовано у файл Excel');
  };

  /* =========================================================================
     АНІМАЦІЯ ПЕРЕХОДУ В АДМІНІСТРАТИВНИЙ ШТАБ
  ========================================================================= */
  if (showAdminAnim) {
    return (
      <div className={`min-h-[100dvh] flex flex-col items-center justify-center p-6 select-none transition-colors duration-300 ${
        isDark ? 'bg-[#07090E] text-slate-100' : 'bg-[#F4F6F9] text-slate-900'
      }`}>
        <div className="animate-fade-in text-center space-y-4">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-3xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.4)]">
            <Crown className="w-12 h-12 sm:w-14 sm:h-14 text-amber-400" />
            <div className="absolute inset-0 rounded-3xl bg-amber-500/25 blur-2xl animate-pulse" />
          </div>
          <div>
            <h1 className={`text-3xl font-black tracking-tight uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Адміністратор
            </h1>
            <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Доступ підтверджено. Перехід до головного штабу проєкту...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================================
     ЕКРАН АВТОРИЗАЦІЇ СУПРОВОДУ
  ========================================================================= */
  if (authedTeam === null) {
    return (
      <div className={`min-h-[100dvh] w-full max-w-md mx-auto px-4 py-6 safe-top pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col justify-between select-none transition-colors duration-300 ${
        isDark ? 'bg-[#07090E] text-slate-100' : 'bg-[#F4F6F9] text-slate-900'
      }`}>
        {loading && <FullScreenLoader label="Перевірка доступу супроводу..." />}
        
        <div>
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={onBack} 
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-2 text-xs sm:text-sm font-semibold transition-colors active:scale-95 ${
                isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowLeft className="w-4 h-4 text-[#FA5A15]" /> 
              <span>Назад</span>
            </button>

            {/* Перемикач теми на екрані входу */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Змінити тему оформлення"
              className={`p-2 min-h-[40px] min-w-[40px] rounded-xl border flex items-center justify-center transition-all shadow-sm active:scale-95 ${
                isDark 
                  ? 'bg-white/5 border-white/10 text-amber-400 hover:bg-white/10' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
          </div>

          <div className="animate-slide-up space-y-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FA5A15]/10 border border-[#FA5A15]/20 text-[10px] font-bold tracking-widest text-[#FA5A15] uppercase mb-2">
                ШТАБ СУПРОВОДУ
              </div>
              <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Я супровід
              </h1>
              <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Введіть номер своєї команди та пароль для входу в систему
              </p>
            </div>

            <Card className={`p-4 sm:p-6 space-y-4 shadow-xl rounded-3xl backdrop-blur-xl border transition-colors ${
              isDark 
                ? 'bg-[#0F1523]/85 border-white/10' 
                : 'bg-white/95 border-slate-200/90 shadow-md'
            }`}>
              <div className="space-y-1.5">
                <Label htmlFor="team" className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Номер команди
                </Label>
                <Input
                  id="team"
                  type="number"
                  inputMode="numeric"
                  placeholder="6"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  className={`h-12 text-base rounded-xl ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-[#FA5A15]' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#FA5A15]'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pwd" className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Пароль доступу
                </Label>
                <Input
                  id="pwd"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className={`h-12 text-base rounded-xl font-mono ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-[#FA5A15]' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#FA5A15]'
                  }`}
                />
              </div>

              <Button 
                onClick={handleLogin} 
                disabled={loading} 
                className="w-full h-12 text-base font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-transform shadow-lg rounded-xl"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти в кабінет'}
              </Button>
            </Card>
          </div>
        </div>

        <footer className={`text-center py-2 text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Всеукраїнський проєкт «Залізна Зміна» · Штаб координації проєкту
        </footer>
      </div>
    );
  }

  /* =========================================================================
     ГОЛОВНИЙ РОБОЧИЙ ЕКРАН СУПРОВОДУ
  ========================================================================= */
  return (
    <div className={`min-h-[100dvh] w-full max-w-3xl mx-auto pb-36 safe-bottom overflow-x-hidden select-none transition-colors duration-300 ${
      isDark ? 'bg-[#07090E] text-slate-100' : 'bg-[#F4F6F9] text-slate-900'
    }`}>
      
      {/* Верхня фіксована панель */}
      <header className={`px-4 py-3 safe-top border-b backdrop-blur-xl sticky top-0 z-30 transition-colors ${
        isDark 
          ? 'border-white/10 bg-[#0F1523]/80' 
          : 'border-slate-200/80 bg-white/90 shadow-sm'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <button 
            onClick={logout} 
            data-tour="step-8-logout-button" 
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl active:scale-95 border text-xs font-semibold transition-all shadow-sm ${
              isDark 
                ? 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white' 
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700 hover:text-slate-900'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#FA5A15]" strokeWidth={2.2} />
            <span>Вийти</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Перемикач теми оформлення */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Змінити тему оформлення"
              title="Змінити тему оформлення"
              className={`p-2 min-h-[40px] min-w-[40px] rounded-xl border flex items-center justify-center transition-all shadow-sm active:scale-95 ${
                isDark 
                  ? 'bg-white/5 border-white/10 text-amber-400 hover:bg-white/10' 
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Кнопка запуску інструктажу */}
            <button
              type="button"
              onClick={startTour}
              aria-label="Пройти навчання"
              title="Пройти навчання"
              className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border text-xs font-bold active:scale-95 transition-all shadow-sm ${
                isDark 
                  ? 'border-[#FA5A15]/30 bg-[#FA5A15]/10 text-[#FA5A15] hover:bg-[#FA5A15]/20' 
                  : 'border-orange-200 bg-orange-50 text-[#FA5A15] hover:bg-orange-100'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden xs:inline sm:inline">Інструктаж</span>
            </button>

            {/* Номер команди */}
            <div className="text-right pl-1">
              <p className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Команда
              </p>
              <p className="text-base sm:text-lg font-black text-[#FA5A15] leading-none font-mono">
                #{authedTeam}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Вкладки робочого простору */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full px-3 pt-2">
        {!isMobile && (
          <div className={`sticky top-[65px] z-20 px-1 py-2 backdrop-blur-md transition-colors ${
            isDark ? 'bg-[#07090E]/90' : 'bg-[#F4F6F9]/90'
          }`}>
            <TabDock items={tabItems} value={activeTab} onChange={handleTabChange} />
          </div>
        )}
        {isMobile && <TabDock items={tabItems} value={activeTab} onChange={handleTabChange} />}

        {/* 1. КОМАНДИ ТА УЧАСНИКИ */}
        <TabsContent value="teams" className="mt-2 animate-fade-in">
          <TeamsView
            myTeam={authedTeam}
            openTeam={openTeam}
            onOpenTeamChange={setOpenTeam}
            editChild={editChild}
            onEditChildChange={(c) => { if (tourOpen && !c) return; setEditChild(c); }}
            onFirstTeamChild={setFirstTeamChild}
          />
        </TabsContent>

        {/* 2. РОЗКЛАД */}
        <TabsContent value="schedule" className="mt-2 animate-fade-in">
          <div data-tour="step-schedule-timeline">
            <ScheduleView
              myTeam={authedTeam}
              isStaff
              onFairAction={() => setActiveTab('fair')}
            />
          </div>
        </TabsContent>

        {/* 3. ТАЛАНТИ */}
        {talent.active && (
          <TabsContent value="talent" className="mt-2 animate-fade-in">
            <TalentTeamView myTeam={authedTeam} />
          </TabsContent>
        )}

        {/* 4. КАСА ЯРМАРКУ (AIR PAY) */}
        <TabsContent value="fair" className="mt-2 animate-fade-in">
          <div data-tour="step-fair-terminal">
            <SupervisorFairView myTeam={authedTeam} isLive={fair.isLiveFairRunning} />
          </div>
        </TabsContent>

        {/* 5. ПОТЯГ ТА КУПЕ */}
        {TRAIN_FEATURE_ENABLED && (
          <TabsContent value="coupes" className="mt-2 animate-fade-in space-y-3">
            <div data-tour="step-7-coupes-root" className="space-y-3">
              <TrainPublishStatus />
              <p className={`text-[10px] uppercase tracking-[0.2em] px-1 font-bold ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {TRAIN_TITLE}
              </p>
              <CoupeSwapSettings myTeam={authedTeam} />
              <CoupeManager myTeam={authedTeam} />
            </div>
          </TabsContent>
        )}

        {/* 6. ТРАНСФЕРИ */}
        <TabsContent value="transfers" className="mt-2 animate-fade-in">
          <TransfersView myTeam={authedTeam} />
        </TabsContent>

        {/* 7. СПОВІЩЕННЯ */}
        <TabsContent value="notifications" className="mt-2 animate-fade-in">
          <NotificationsView myTeam={authedTeam} onRestartTour={startTour} />
        </TabsContent>
      </Tabs>

      {/* Плаваючі кнопки швидкої дії (Банк А$ та Excel-експорт) */}
      <div 
        className="fixed right-4 flex flex-col gap-2.5 z-40"
        style={{
          bottom: isMobile 
            ? 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' 
            : '1.75rem'
        }}
      >
        <Button
          onClick={() => {
            haptics.impact('light');
            setBankOpen(true);
          }}
          data-tour="step-5-bank-button"
          className="h-12 w-12 rounded-2xl shadow-2xl p-0 bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-90 transition-all border border-orange-400/30"
          title="Банк Айрон-доларів"
        >
          <Wallet className="w-5 h-5" />
        </Button>

        <Button
          onClick={handleExport}
          className={`h-11 w-11 rounded-2xl shadow-xl p-0 border active:scale-90 transition-all ${
            isDark 
              ? 'bg-[#0F1523]/90 hover:bg-[#151D2F] border-white/10 text-slate-300 hover:text-white' 
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 shadow-md'
          }`}
          title="Експорт списків в Excel"
        >
          <Download className="w-4 h-4 text-emerald-500" />
        </Button>
      </div>

      {/* Інтерактивний тур навчання */}
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

      {/* Модальне вікно Банку Айрон-доларів */}
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
