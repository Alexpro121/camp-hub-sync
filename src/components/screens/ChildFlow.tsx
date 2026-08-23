import { useEffect, useState, useCallback } from 'react';
import { 
  ArrowLeft, 
  Coins, 
  User, 
  Phone, 
  Hash, 
  Users, 
  FileText, 
  Loader2, 
  Shield, 
  Check, 
  ChevronDown, 
  HelpCircle, 
  Copy, 
  Tag, 
  MapPin, 
  ShoppingBag, 
  Mic2,
  Calendar,
  Sun,
  Moon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Child } from '@/types/app';
import { type NameSuggestion } from '@/lib/normalize';
import { useHaptics } from '@/hooks/useHaptics';
import { FullScreenLoader } from '@/components/ui/loader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ChildCoupeCard from '@/components/coupes/ChildCoupeCard';
import ScheduleView from '@/components/schedule/ScheduleView';
import { useScheduleNotifier } from '@/hooks/useScheduleNotifier';
import { useTalentEventActive } from '@/hooks/useTalentEventActive';
import TalentTeamView from '@/components/talent/TalentTeamView';
import { useTeamPhase } from '@/hooks/useTeamPhase';
import PhaseBanner from '@/components/shift/PhaseBanner';
import { useAggressiveFairUnlock } from '@/hooks/useAggressiveFairUnlock';
import ChildFairCard from '@/components/fair/ChildFairCard';
import ApplePayScannerModal from '@/components/fair/ApplePayScannerModal';
import TransactionHistory from '@/components/fair/TransactionHistory';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { clearSavedSession, getSavedChildId, getSavedRole, saveSession } from '@/lib/session';

interface Props { 
  onBack: () => void; 
}

interface Candidate {
  id: string;
  full_name: string;
  team_number: number;
  team_name: string | null;
}

const ChildFlow = ({ onBack }: Props) => {
  const [step, setStep] = useState<'login' | 'profile'>('login');
  const [fullName, setFullName] = useState('');
  const [team, setTeam] = useState('');
  const [loading, setLoading] = useState(false);
  const [child, setChild] = useState<Child | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<NameSuggestion<Candidate>[]>([]);
  
  // Керування темою оформлення для кабінету дитини
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('child_theme_mode');
    return saved ? saved === 'dark' : true;
  });

  const haptics = useHaptics();
  const island = useDynamicIsland();
  const talent = useTalentEventActive();
  const fair = useAggressiveFairUnlock(!!child);
  const { status: phase } = useTeamPhase(child?.team_number ?? null);

  // Сповіщення про розклад у Dynamic Island
  useScheduleNotifier(child?.team_number ?? null, !!child);

  // Ізольоване збереження теми дитини + автоматичне повернення темної теми для адміна/супроводу при виході
  useEffect(() => {
    localStorage.setItem('child_theme_mode', isDark ? 'dark' : 'light');

    return () => {
      // При виході з кабінету дитини обов'язково повертаємо темний режим для адміна та супроводу
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    };
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    haptics.impact('light');
    setIsDark((prev) => !prev);
  }, [haptics]);

  // Авто-вхід при збереженій дійсній сесії
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedId = getSavedRole() === 'child' ? getSavedChildId() : null;
      if (!savedId) return;
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session || cancelled) return;
      const { data: row } = await supabase.from('children').select('*').eq('id', savedId).maybeSingle();
      if (cancelled || !row) return;
      setChild(row as Child);
      setStep('profile');
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime слухач оновлень даних дитини
  useEffect(() => {
    if (!child?.id) return;
    const channel = supabase
      .channel(`child-sync-${child.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'children', filter: `id=eq.${child.id}` },
        (payload) => {
          if (payload.new) {
            setChild((prev) => ({ ...prev, ...(payload.new as Child) }));
          }
        }
      )
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [child?.id]);

  // Realtime сповіщення про нарахування Айрон-доларів з Dynamic Island
  useEffect(() => {
    const childId = child?.id;
    if (!childId) return;
    const channel = supabase
      .channel(`child_incoming_funds:${childId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'iron_dollar_transactions',
        filter: `child_id=eq.${childId}`,
      }, (payload) => {
        const tx = payload.new as { amount_change: number; reason: string | null };
        if (tx.amount_change > 0) {
          island.showSuccess(`+${tx.amount_change} Айрон-доларів`, tx.reason || 'Нараховано супроводом');
          haptics.notification('success');
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [child?.id, island, haptics]);

  const loginAs = async (candidate: { id: string }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('child-login', {
        body: { action: 'claim', childId: candidate.id },
      });
      if (error || !data?.session) throw new Error('Не вдалося увійти');

      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      const { data: row, error: rowErr } = await supabase
        .from('children')
        .select('*')
        .eq('id', candidate.id)
        .single();
      if (rowErr || !row) throw new Error('Не вдалося завантажити профіль');

      setChild(row as Child);
      setStep('profile');
      setSuggestions([]);
      saveSession('child', { childId: candidate.id, teamNumber: (row as Child).team_number ?? null });
      haptics.notification('success');
      toast.success(`Привіт, ${String((row as Child).full_name || '').split(' ')[0]}!`);
    } catch (e: any) {
      haptics.notification('error');
      toast.error(e.message || 'Помилка входу');
    } finally {
      setLoading(false);
    }
  };

  const handleExit = async () => {
    await supabase.auth.signOut();
    clearSavedSession();
    onBack();
  };

  const handleLogin = async () => {
    if (!fullName.trim()) {
      toast.error('Введи ПІБ');
      return;
    }
    if (fullName.trim().split(/\s+/).filter(Boolean).length < 2) {
      toast.error('Введи повне ПІБ (мінімум прізвище та імʼя)');
      return;
    }
    if (!team.replace(/[^\d]/g, '')) {
      toast.error('Введи номер команди');
      return;
    }
    setLoading(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke('child-login', {
        body: { action: 'search', fullName: fullName.trim(), team },
      });
      if (error) throw new Error('Помилка входу');

      if (data?.exact) {
        await loginAs(data.exact);
        return;
      }

      toast.error('Не знайдено. Перевір ПІБ та номер команди.');
    } catch (e: any) {
      toast.error(e.message || 'Помилка входу');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    haptics.impact('light');
    toast.success(label);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || 'УЧ';
  };

  // Оптимістичне оновлення балансу при оплаті
  const handleBalancePaid = (newBalance: number) => {
    setChild((prev) => prev ? { ...prev, iron_dollars: newBalance } : prev);
  };

  /* =========================================================================
     ЕКРАН 1: ПРОФІЛЬ УЧАСНИКА (АВТОРИЗОВАНИЙ СТАН)
  ========================================================================= */
  if (step === 'profile' && child) {
    const rawEntries = child.raw_data && typeof child.raw_data === 'object'
      ? Object.entries(child.raw_data as Record<string, any>)
      : [];

    const shortId = child.id.slice(0, 6).toUpperCase();

    return (
      <div 
        id="child-flow-root"
        className={`relative min-h-[100dvh] w-full max-w-md mx-auto px-3.5 sm:px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] safe-top safe-bottom flex flex-col justify-between gap-3 select-none transition-colors duration-300 overflow-x-hidden ${
          isDark ? 'theme-dark bg-[#07090E] text-slate-100' : 'theme-light bg-[#F1F5F9] text-slate-900'
        }`}
      >
        
        {/* ================= ГЛОБАЛЬНИЙ ІЗОЛЬОВАНИЙ CSS-РУШІЙ ТЕМИ ================= */}
        <style>{`
          /* Повне перефарбування всіх вкладених карток та компонентів у світлій темі */
          #child-flow-root.theme-light {
            color-scheme: light;
          }
          #child-flow-root.theme-light .bg-card,
          #child-flow-root.theme-light [class*="bg-card"],
          #child-flow-root.theme-light [class*="bg-[#0F1523]"],
          #child-flow-root.theme-light [class*="bg-[#0f1523]"] {
            background-color: #ffffff !important;
            color: #0f172a !important;
            border-color: #e2e8f0 !important;
            box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.06) !important;
          }

          #child-flow-root.theme-light [class*="text-muted-foreground"],
          #child-flow-root.theme-light [class*="text-slate-400"],
          #child-flow-root.theme-light [class*="text-slate-500"] {
            color: #64748b !important;
          }

          #child-flow-root.theme-light [class*="text-white"],
          #child-flow-root.theme-light [class*="text-slate-100"],
          #child-flow-root.theme-light [class*="text-slate-200"],
          #child-flow-root.theme-light [class*="text-slate-300"] {
            color: #0f172a !important;
          }

          #child-flow-root.theme-light [class*="bg-muted"],
          #child-flow-root.theme-light [class*="bg-surface-1"],
          #child-flow-root.theme-light [class*="bg-[#0A0E18]"],
          #child-flow-root.theme-light [class*="bg-[#151C2C]"] {
            background-color: #f8fafc !important;
            color: #0f172a !important;
            border-color: #e2e8f0 !important;
          }

          /* Вкладки (Tabs) */
          #child-flow-root.theme-light [role="tablist"] {
            background-color: #e2e8f0 !important;
            border-color: #cbd5e1 !important;
          }
          #child-flow-root.theme-light [role="tab"][data-state="active"] {
            background-color: #ffffff !important;
            color: #0f172a !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
          }
          #child-flow-root.theme-light [role="tab"][data-state="inactive"] {
            color: #64748b !important;
          }

          /* Елементи списку */
          #child-flow-root.theme-light .divide-y > div,
          #child-flow-root.theme-light [class*="border-border"] {
            border-color: #e2e8f0 !important;
          }

          /* Брендові акценти */
          #child-flow-root.theme-light .text-primary,
          #child-flow-root.theme-light [class*="text-primary"],
          #child-flow-root.theme-light [class*="text-[#FA5A15]"] {
            color: #FA5A15 !important;
          }
          #child-flow-root.theme-light [class*="bg-[#FA5A15]"],
          #child-flow-root.theme-light button[class*="bg-[#FA5A15]"] {
            background-color: #FA5A15 !important;
            color: #ffffff !important;
          }
        `}</style>

        {/* Анімований фоновий перелив */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[450px] h-[450px] rounded-full blur-[120px] transition-all duration-700 ${
            isDark ? 'bg-[#FA5A15]/10' : 'bg-[#FA5A15]/15'
          }`} />
          <div className={`absolute -bottom-32 left-1/2 -translate-x-1/2 w-[400px] h-[350px] rounded-full blur-[130px] transition-all duration-700 ${
            isDark ? 'bg-sky-500/[0.06]' : 'bg-sky-400/20'
          }`} />
        </div>

        <div className="relative z-10 flex flex-col gap-3">
          {/* Верхній навігаційний бар */}
          <header className="flex items-center justify-between gap-2">
            <button
              onClick={() => { haptics.impact('light'); handleExit(); }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl active:scale-95 text-xs font-semibold transition-all shadow-sm ${
                isDark 
                  ? 'bg-[#0F1523]/80 hover:bg-[#151D2F] border border-white/10 text-slate-300' 
                  : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FA5A15]" strokeWidth={2} />
              <span>Вийти</span>
            </button>

            <div className="flex items-center gap-1.5">
              {/* Перемикач теми: світла / темна */}
              <button
                onClick={toggleTheme}
                title="Змінити тему"
                className={`p-2 rounded-xl active:scale-95 transition-all shadow-sm ${
                  isDark 
                    ? 'bg-[#0F1523]/80 hover:bg-[#151D2F] border border-white/10 text-amber-400' 
                    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
                }`}
              >
                {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
              </button>

              {/* ID учасника */}
              <button
                onClick={() => handleCopy(shortId, `ID ${shortId} скопійовано`)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl active:scale-95 text-xs font-mono transition-all shadow-sm ${
                  isDark 
                    ? 'bg-[#0F1523]/80 hover:bg-[#151D2F] border border-white/10 text-slate-300' 
                    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
                }`}
              >
                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>ID:</span>
                <span className={`font-bold tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>{shortId}</span>
                <Copy className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          </header>

          {/* Головна картка ідентифікації */}
          <div className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl backdrop-blur-md relative overflow-hidden transition-all duration-300 ${
            isDark 
              ? 'bg-[#0F1523]/85 border border-white/10 shadow-xl' 
              : 'bg-white/95 border border-slate-200/80 shadow-md'
          }`}>
            {/* Статусний рядок */}
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-[#FA5A15]/15 border border-[#FA5A15]/25 flex items-center justify-center">
                  <Shield className="w-3 h-3 text-[#FA5A15]" strokeWidth={2} />
                </div>
                <span className={`text-[10px] sm:text-[11px] font-bold tracking-[0.22em] uppercase ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  Залізна зміна
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-semibold text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Учасник
              </span>
            </div>

            {/* Аватар, ПІБ та мітки */}
            <div className="flex items-center gap-3.5 mb-3.5">
              <div className="relative shrink-0">
                <div className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-bold text-base sm:text-lg shadow-inner ${
                  isDark 
                    ? 'bg-gradient-to-br from-[#182236] to-[#0F1626] border border-white/10 text-white' 
                    : 'bg-gradient-to-br from-orange-100 to-orange-50 border border-orange-200 text-[#FA5A15]'
                }`}>
                  {getInitials(child.full_name)}
                </div>
                {child.has_logged_in && (
                  <span className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0F1523] flex items-center justify-center shadow">
                    <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className={`text-lg sm:text-xl font-bold leading-tight tracking-tight truncate ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}>
                  {child.full_name}
                </h1>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-slate-200' 
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}>
                    Команда №{child.team_number}
                  </span>
                  {child.team_name && (
                    <span className="px-2 py-0.5 rounded-md bg-[#FA5A15]/15 border border-[#FA5A15]/30 text-[11px] font-medium text-[#FA5A15] capitalize">
                      {child.team_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Віджет Айрон-доларів */}
            <div className={`p-3.5 sm:p-4 rounded-xl border flex items-center justify-between gap-3 shadow-inner ${
              isDark 
                ? 'bg-[#0A0E18] border-white/10' 
                : 'bg-slate-50 border-slate-200/80'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#FA5A15]/15 border border-[#FA5A15]/25 flex items-center justify-center shrink-0">
                  <Coins className="w-4.5 h-4.5 text-[#FA5A15]" strokeWidth={1.8} />
                </div>
                <div>
                  <span className={`text-[10px] font-bold tracking-wider uppercase block leading-none ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    Гаманець
                  </span>
                  <span className={`text-xs font-semibold mt-0.5 block ${
                    isDark ? 'text-slate-200' : 'text-slate-700'
                  }`}>
                    Айрон-долари
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono text-2xl sm:text-3xl font-black tabular-nums tracking-tight flex items-baseline justify-end gap-1">
                  <span className="text-[#FA5A15]">{child.iron_dollars}</span>
                  <span className={`text-xs font-sans font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>А$</span>
                </div>
              </div>
            </div>
          </div>

          {/* Навігаційні вкладки */}
          <Tabs
            defaultValue="profile"
            className="w-full"
            onValueChange={(v) => { haptics.impact('light'); if (v === 'talent') talent.markSeen(); }}
          >
            <TabsList
              className={`grid w-full h-11 mb-2 p-1 rounded-xl shadow-sm border transition-colors ${
                isDark 
                  ? 'bg-[#0F1523]/80 border-white/10 text-slate-400' 
                  : 'bg-slate-200/80 border-slate-300/80 text-slate-600'
              } ${
                ['grid-cols-2', 'grid-cols-3', 'grid-cols-4'][
                  (talent.active ? 1 : 0) + (fair.hasFairAccess ? 1 : 0)
                ]
              }`}
            >
              <TabsTrigger value="profile" className="text-xs min-h-[36px] font-semibold rounded-lg">
                Профіль
              </TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs min-h-[36px] font-semibold rounded-lg gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Розклад</span>
              </TabsTrigger>
              
              {fair.hasFairAccess && (
                <TabsTrigger value="fair" className="text-xs min-h-[36px] font-semibold rounded-lg relative gap-1.5">
                  <ShoppingBag
                    className={`w-3.5 h-3.5 ${fair.isLiveFairRunning ? 'text-amber-500' : ''}`}
                    strokeWidth={1.9}
                  /> 
                  <span>Ярмарок</span>
                  {fair.isLiveFairRunning && (
                    <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </TabsTrigger>
              )}

              {talent.active && (
                <TabsTrigger value="talent" className="text-xs min-h-[36px] font-semibold rounded-lg relative gap-1.5">
                  <Mic2 className="w-3.5 h-3.5" strokeWidth={1.9} /> 
                  <span>Таланти</span>
                  {talent.isNew && (
                    <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {/* ВМІСТ 1: ПРОФІЛЬ */}
            <TabsContent value="profile" className="space-y-3 mt-0">
              {/* Картка оплати ярмарку показується завжди при відкритті або доступі */}
              {child && (fair.isLiveFairRunning || fair.hasFairAccess) && (
                <ChildFairCard
                  childId={child.id}
                  balance={child.iron_dollars}
                  childName={child.full_name}
                  childTeam={child.team_number}
                />
              )}
              
              {(!phase || phase.currentPhase !== 'PREPARING') && (
                <ChildCoupeCard childId={child.id} teamNumber={child.team_number} />
              )}

              {/* Історія транзакцій */}
              <TransactionHistory childId={child.id} collapsible />

              {/* Персональні дані */}
              <div className={`p-4 rounded-2xl sm:rounded-3xl border space-y-3 shadow-sm transition-colors ${
                isDark 
                  ? 'bg-[#0F1523]/85 border-white/10' 
                  : 'bg-white/95 border-slate-200/80'
              }`}>
                <div className={`flex items-center justify-between border-b pb-2 ${
                  isDark ? 'border-white/5' : 'border-slate-100'
                }`}>
                  <span className={`text-[10px] font-bold tracking-widest uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    Персональні дані
                  </span>
                  <span className="text-[10px] text-emerald-500 font-medium">Активна зміна</span>
                </div>

                {/* Сітка: № у списку та Команда */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-2.5 rounded-xl border ${
                    isDark ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200/80'
                  }`}>
                    <div className={`flex items-center gap-1.5 text-[11px] mb-0.5 ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      <Hash className="w-3.5 h-3.5 text-[#FA5A15]" />
                      <span>№ у списку</span>
                    </div>
                    <p className={`text-base font-bold font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {child.row_number?.toString() || '—'}
                    </p>
                  </div>

                  <div className={`p-2.5 rounded-xl border ${
                    isDark ? 'bg-white/[0.03] border-white/5' : 'bg-slate-50 border-slate-200/80'
                  }`}>
                    <div className={`flex items-center gap-1.5 text-[11px] mb-0.5 ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      <Users className="w-3.5 h-3.5 text-[#FA5A15]" />
                      <span>Команда</span>
                    </div>
                    <p className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      №{child.team_number}
                    </p>
                  </div>
                </div>

                {/* Список деталей */}
                <div className="space-y-1.5 text-xs pt-0.5">
                  {child.team_name && (
                    <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
                      isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200/80'
                    }`}>
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <Tag className="w-3.5 h-3.5" />
                        <span>Категорія:</span>
                      </div>
                      <span className={`font-semibold capitalize ${isDark ? 'text-white' : 'text-slate-900'}`}>{child.team_name}</span>
                    </div>
                  )}

                  {child.phone && (
                    <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
                      isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200/80'
                    }`}>
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <Phone className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Телефон:</span>
                      </div>
                      <span className={`font-mono font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{child.phone}</span>
                    </div>
                  )}

                  {child.note_from_table && (
                    <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
                      isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200/80'
                    }`}>
                      <div className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <MapPin className="w-3.5 h-3.5 text-sky-500" />
                        <span>Локація / Примітка:</span>
                      </div>
                      <span className={`font-semibold break-words text-right ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {child.note_from_table}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Усі поля з таблиці */}
              {rawEntries.length > 0 && (
                <div className={`rounded-2xl border overflow-hidden shadow-sm transition-colors ${
                  isDark 
                    ? 'bg-[#0F1523]/85 border-white/10' 
                    : 'bg-white/95 border-slate-200/80'
                }`}>
                  <button
                    onClick={() => { haptics.impact('light'); setShowAllFields((v) => !v); }}
                    className={`w-full flex items-center justify-between p-3.5 transition-colors ${
                      isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                      <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Усі поля з таблиці ({rawEntries.length})
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showAllFields ? 'rotate-180' : ''}`}
                      strokeWidth={1.75}
                    />
                  </button>

                  {showAllFields && (
                    <div className={`border-t divide-y max-h-72 overflow-y-auto ${
                      isDark ? 'border-white/5 divide-white/5' : 'border-slate-100 divide-slate-100'
                    }`}>
                      {rawEntries.map(([k, v]) => (
                        <div key={k} className="flex items-start justify-between gap-3 p-2.5 px-3.5 text-xs font-mono">
                          <span className={`text-[11px] min-w-[35%] truncate font-sans ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {/^команда$/i.test(k.trim()) ? 'Категорія' : k}:
                          </span>
                          <span className={`text-right break-words flex-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ВМІСТ 2: РОЗКЛАД */}
            <TabsContent value="schedule" className="mt-0 space-y-3">
              {phase?.currentPhase === 'PREPARING' ? (
                <PhaseBanner status={phase} teamNumber={child.team_number} />
              ) : (
                <ScheduleView
                  myTeam={child.team_number}
                  lockTeam
                  onFairAction={() => setScannerOpen(true)}
                />
              )}
            </TabsContent>

            {/* ВМІСТ 3: ЯРМАРОК */}
            {fair.hasFairAccess && (
              <TabsContent value="fair" className="mt-0 space-y-3">
                {fair.isLiveFairRunning ? (
                  <ChildFairCard
                    childId={child.id}
                    balance={child.iron_dollars}
                    childName={child.full_name}
                    childTeam={child.team_number}
                  />
                ) : (
                  <div className={`p-4 rounded-2xl border space-y-2 shadow-sm ${
                    isDark 
                      ? 'bg-[#0F1523]/85 border-white/10' 
                      : 'bg-white/95 border-slate-200/80'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                      <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Ярмарок
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`font-mono text-3xl font-bold tabular-nums ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {child.iron_dollars}
                      </span>
                      <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Айрон-доларів</span>
                    </div>
                    <p className={`text-xs pt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Торгівлю на ярмарку завершено. Дякуємо за активність!
                    </p>
                  </div>
                )}
                <TransactionHistory childId={child.id} />
              </TabsContent>
            )}

            {/* ВМІСТ 4: ТАЛАНТИ */}
            {talent.active && (
              <TabsContent value="talent" className="mt-0">
                <TalentTeamView myTeam={child.team_number} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Футер */}
        <footer className={`text-center py-1 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Дані оновлюються в реальному часі
        </footer>

        <ApplePayScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          balance={child.iron_dollars}
          onPaid={handleBalancePaid}
          childName={child.full_name}
          childTeam={child.team_number}
        />
      </div>
    );
  }

  /* =========================================================================
     ЕКРАН 2: ФОРМА ВХОДУ (НЕАВТОРИЗОВАНИЙ СТАН)
  ========================================================================= */
  return (
    <div className={`min-h-[100dvh] w-full max-w-md mx-auto px-4 py-5 safe-top safe-bottom flex flex-col justify-between select-none transition-colors duration-500 overflow-x-hidden ${
      isDark ? 'bg-[#07090E] text-slate-100' : 'bg-[#F1F5F9] text-slate-900'
    }`}>
      {loading && <FullScreenLoader label="Шукаємо твій профіль..." />}
      
      <div>
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={onBack} 
            className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors active:scale-95 ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeft className="w-4 h-4 text-[#FA5A15]" /> 
            <span>Назад</span>
          </button>

          <button
            onClick={toggleTheme}
            title="Змінити тему"
            className={`p-2 rounded-xl border transition-all shadow-sm ${
              isDark 
                ? 'bg-[#0F1523]/80 border-white/10 text-amber-400' 
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
          </button>
        </div>

        <div className="animate-slide-up space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FA5A15]/10 border border-[#FA5A15]/20 text-[10px] font-bold tracking-widest text-[#FA5A15] uppercase mb-2">
              ОСОБИСТИЙ КАБІНЕТ
            </div>
            <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Я учасник
            </h1>
            <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Введи своє ПІБ та номер команди для входу
            </p>
          </div>

          <div className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl border space-y-4 shadow-sm transition-colors ${
            isDark 
              ? 'bg-[#0F1523]/85 border-white/10' 
              : 'bg-white/95 border-slate-200/80'
          }`}>
            <div className="space-y-1.5">
              <Label htmlFor="name" className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Прізвище та ім'я
              </Label>
              <Input
                id="name"
                placeholder="Ковальчук Соломія"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (suggestions.length) setSuggestions([]); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className={`h-12 text-base ${
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-[#FA5A15]' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#FA5A15]'
                }`}
              />
            </div>

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
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className={`h-12 text-base ${
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-[#FA5A15]' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#FA5A15]'
                }`}
              />
              <p className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Не пам'ятаєш команду? Запитай у свого <strong className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>супроводу</strong> або куратора.
              </p>
            </div>

            <Button 
              onClick={() => { haptics.impact('light'); handleLogin(); }} 
              disabled={loading} 
              className="w-full h-12 text-base font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-transform shadow-md"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти в кабінет'}
            </Button>
          </div>

          {/* Підказки неточного пошуку */}
          {suggestions.length > 0 && (
            <div className={`p-4 rounded-2xl border animate-slide-up space-y-3 shadow-sm ${
              isDark 
                ? 'bg-[#0F1523]/90 border-white/10' 
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#FA5A15] shrink-0" />
                <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Знайдено схожі профілі:
                </p>
              </div>

              <div className="space-y-2">
                {suggestions.map(({ item, score }) => {
                  const pct = Math.round(score * 100);
                  return (
                    <button
                      key={item.id}
                      onClick={() => { haptics.impact('light'); loginAs(item); }}
                      className={`w-full p-3 rounded-xl border text-left transition-all active:scale-[0.98] flex items-center gap-3 ${
                        isDark 
                          ? 'bg-white/5 hover:bg-white/10 border-white/5' 
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#FA5A15]/15 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-[#FA5A15]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.full_name}</p>
                        <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Команда №{item.team_number}
                          {item.team_name ? ` · ${item.team_name}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[#FA5A15] tabular-nums shrink-0 px-2 py-0.5 rounded bg-[#FA5A15]/10">
                        {pct}%
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className={`text-[10px] text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Якщо твого імені немає — звернись до супроводу.
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className={`text-center py-2 text-[11px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
        Залізна Зміна · Система Координації
      </footer>
    </div>
  );
};

export default ChildFlow;
