import { useEffect, useState } from 'react';
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
import { Card } from '@/components/ui/card';
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
  
  // Правильна ініціалізація та керування темою
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return document.documentElement.classList.contains('dark');
  });

  const haptics = useHaptics();
  const island = useDynamicIsland();
  const talent = useTalentEventActive();
  const fair = useAggressiveFairUnlock(!!child);
  const { status: phase } = useTeamPhase(child?.team_number ?? null);

  // Сповіщення про розклад у Dynamic Island
  useScheduleNotifier(child?.team_number ?? null, !!child);

  // Синхронізація теми з класом тегу <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    haptics.impact('light');
    setIsDark((prev) => !prev);
  };

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

  // Realtime слухач оновлень профілю дитини
  useEffect(() => {
    if (!child) return;
    const channel = supabase
      .channel(`child-${child.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'children', filter: `id=eq.${child.id}` },
        (payload) => setChild(payload.new as Child)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [child?.id]);

  // Realtime сповіщення про нарахування Айрон-доларів
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
    return () => { supabase.removeChannel(channel); };
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

  /* =========================================================================
     ЕКРАН 1: ПРОФІЛЬ УЧАСНИКА (АВТОРИЗОВАНИЙ СТАН)
  ========================================================================= */
  if (step === 'profile' && child) {
    const rawEntries = child.raw_data && typeof child.raw_data === 'object'
      ? Object.entries(child.raw_data as Record<string, any>)
      : [];

    const shortId = child.id.slice(0, 6).toUpperCase();

    return (
      <div className="relative min-h-[100dvh] px-3.5 sm:px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] max-w-md mx-auto safe-top safe-bottom flex flex-col justify-between gap-3 text-foreground transition-colors duration-300 select-none">
        
        {/* М'який фоновий переливний градієнт */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[450px] h-[450px] bg-primary/[0.08] dark:bg-primary/[0.12] rounded-full blur-[120px]" />
          <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[400px] h-[350px] bg-sky-500/[0.05] dark:bg-sky-500/[0.08] rounded-full blur-[130px]" />
        </div>

        <div className="relative z-10 flex flex-col gap-3">
          {/* Верхній навігаційний бар */}
          <header className="flex items-center justify-between gap-2">
            <button
              onClick={() => { haptics.impact('light'); handleExit(); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card/80 hover:bg-card active:scale-95 border border-border/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
              <span>Вийти</span>
            </button>

            <div className="flex items-center gap-1.5">
              {/* Перемикач теми */}
              <button
                onClick={toggleTheme}
                title="Змінити тему"
                className="p-2 rounded-xl bg-card/80 hover:bg-card active:scale-95 border border-border/50 text-muted-foreground hover:text-foreground transition-all shadow-sm"
              >
                {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
              </button>

              {/* ID учасника */}
              <button
                onClick={() => handleCopy(shortId, `ID ${shortId} скопійовано`)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card/80 hover:bg-card active:scale-95 border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-all shadow-sm"
              >
                <span className="text-muted-foreground/70">ID:</span>
                <span className="font-bold text-foreground tracking-wider">{shortId}</span>
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </header>

          {/* Головна картка ідентифікації */}
          <Card className="p-4 sm:p-5 bg-card/85 backdrop-blur-md border-border/60 shadow-sm relative overflow-hidden transition-all duration-300">
            {/* Статусний рядок */}
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <Shield className="w-3 h-3 text-primary" strokeWidth={2} />
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.22em] text-muted-foreground uppercase">
                  Залізна зміна
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Учасник
              </span>
            </div>

            {/* Аватар, ПІБ та мітки */}
            <div className="flex items-center gap-3.5 mb-3.5">
              <div className="relative shrink-0">
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-muted border border-border/60 flex items-center justify-center text-foreground font-bold text-base sm:text-lg shadow-inner">
                  {getInitials(child.full_name)}
                </div>
                {child.has_logged_in && (
                  <span className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center shadow">
                    <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-bold leading-tight tracking-tight text-foreground truncate">
                  {child.full_name}
                </h1>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border/50 text-[11px] font-medium text-foreground">
                    Команда №{child.team_number}
                  </span>
                  {child.team_name && (
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary capitalize">
                      {child.team_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Віджет Айрон-доларів */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                  <Coins className="w-4.5 h-4.5 text-primary" strokeWidth={1.8} />
                </div>
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block leading-none">
                    Гаманець
                  </span>
                  <span className="text-xs font-semibold text-foreground mt-0.5 block">
                    Айрон-долари
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground flex items-baseline justify-end gap-1">
                  <span className="text-primary">{child.iron_dollars}</span>
                  <span className="text-xs font-sans font-bold text-muted-foreground">А$</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Навігаційні вкладки */}
          <Tabs
            defaultValue="profile"
            className="w-full"
            onValueChange={(v) => { haptics.impact('light'); if (v === 'talent') talent.markSeen(); }}
          >
            <TabsList
              className={`grid w-full h-11 mb-2 p-1 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl shadow-sm ${
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
                    className={`w-3.5 h-3.5 ${fair.isLiveFairRunning ? 'text-amber-400' : ''}`}
                    strokeWidth={1.9}
                  /> 
                  <span>Ярмарок</span>
                  {fair.isLiveFairRunning && (
                    <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </TabsTrigger>
              )}

              {talent.active && (
                <TabsTrigger value="talent" className="text-xs min-h-[36px] font-semibold rounded-lg relative gap-1.5">
                  <Mic2 className="w-3.5 h-3.5" strokeWidth={1.9} /> 
                  <span>Таланти</span>
                  {talent.isNew && (
                    <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {/* ВМІСТ 1: ПРОФІЛЬ */}
            <TabsContent value="profile" className="space-y-3 mt-0">
              {fair.isLiveFairRunning && child && (!phase || phase.currentPhase !== 'PREPARING') && (
                <ChildFairCard
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
              <Card className="p-4 bg-card/85 backdrop-blur-md border-border/50 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Персональні дані
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Активна зміна</span>
                </div>

                {/* Сітка: № у списку та Команда */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-0.5">
                      <Hash className="w-3.5 h-3.5 text-primary" />
                      <span>№ у списку</span>
                    </div>
                    <p className="text-base font-bold font-mono text-foreground">
                      {child.row_number?.toString() || '—'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-0.5">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      <span>Команда</span>
                    </div>
                    <p className="text-base font-bold text-foreground">
                      №{child.team_number}
                    </p>
                  </div>
                </div>

                {/* Список деталей: чистий телефон без зайвих кнопок */}
                <div className="space-y-1.5 text-xs pt-0.5">
                  {child.team_name && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground/80" />
                        <span>Категорія:</span>
                      </div>
                      <span className="font-semibold text-foreground capitalize">{child.team_name}</span>
                    </div>
                  )}

                  {child.phone && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Телефон:</span>
                      </div>
                      <span className="font-mono font-medium text-foreground">{child.phone}</span>
                    </div>
                  )}

                  {child.note_from_table && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 text-sky-500" />
                        <span>Локація / Примітка:</span>
                      </div>
                      <span className="font-semibold text-foreground break-words text-right">
                        {child.note_from_table}
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Усі поля з таблиці */}
              {rawEntries.length > 0 && (
                <Card className="p-0 bg-card/85 backdrop-blur-md border-border/50 overflow-hidden shadow-sm">
                  <button
                    onClick={() => { haptics.impact('light'); setShowAllFields((v) => !v); }}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                      <span className="text-xs font-semibold text-foreground">
                        Усі поля з таблиці ({rawEntries.length})
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${showAllFields ? 'rotate-180' : ''}`}
                      strokeWidth={1.75}
                    />
                  </button>

                  {showAllFields && (
                    <div className="border-t border-border/40 divide-y divide-border/20 max-h-72 overflow-y-auto">
                      {rawEntries.map(([k, v]) => (
                        <div key={k} className="flex items-start justify-between gap-3 p-2.5 px-3.5 text-xs font-mono">
                          <span className="text-[11px] text-muted-foreground min-w-[35%] truncate font-sans">
                            {/^команда$/i.test(k.trim()) ? 'Категорія' : k}:
                          </span>
                          <span className="text-foreground text-right break-words flex-1">
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </TabsContent>

            {/* ВМІСТ 2: РОЗКЛАД (РЕАЛЬНІ ДАНІ БЕЗ ШАБЛОНІВ) */}
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

            {/* ВМІСТ 3: ЯРМАРОК (РЕАЛЬНІ ДАНІ) */}
            {fair.hasFairAccess && (
              <TabsContent value="fair" className="mt-0 space-y-3">
                {fair.isLiveFairRunning ? (
                  <ChildFairCard
                    balance={child.iron_dollars}
                    childName={child.full_name}
                    childTeam={child.team_number}
                  />
                ) : (
                  <Card className="p-4 bg-card/85 backdrop-blur-md border-border/50 space-y-2 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <ShoppingBag className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Ярмарок
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-3xl font-bold text-foreground tabular-nums">
                        {child.iron_dollars}
                      </span>
                      <span className="text-xs text-muted-foreground font-semibold">Айрон-доларів</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      Торгівлю на ярмарку завершено. Дякуємо за активність!
                    </p>
                  </Card>
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
        <footer className="relative z-10 text-center py-1 text-[10px] text-muted-foreground/70">
          Дані оновлюються в реальному часі
        </footer>

        <ApplePayScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          balance={child.iron_dollars}
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
    <div className="min-h-[100dvh] px-4 py-5 max-w-md mx-auto safe-top safe-bottom flex flex-col justify-between text-foreground select-none">
      {loading && <FullScreenLoader label="Шукаємо твій профіль..." />}
      
      <div>
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={onBack} 
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-primary" /> 
            <span>Назад</span>
          </button>

          <button
            onClick={toggleTheme}
            title="Змінити тему"
            className="p-2 rounded-xl bg-card/80 border border-border/50 text-muted-foreground hover:text-foreground transition-all shadow-sm"
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
          </button>
        </div>

        <div className="animate-slide-up space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold tracking-widest text-primary uppercase mb-2">
              ОСОБИСТИЙ КАБІНЕТ
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Я учасник
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1">
              Введи своє ПІБ та номер команди для входу
            </p>
          </div>

          <Card className="p-4 sm:p-5 bg-card/85 backdrop-blur-md border-border/50 space-y-4 shadow-sm">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold text-foreground">
                Прізвище та ім'я
              </Label>
              <Input
                id="name"
                placeholder="Ковальчук Соломія"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (suggestions.length) setSuggestions([]); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="h-12 text-base bg-muted/30 border-border/60 focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team" className="text-xs font-semibold text-foreground">
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
                className="h-12 text-base bg-muted/30 border-border/60 focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground/70 leading-snug">
                Не пам'ятаєш команду? Запитай у свого <strong className="text-foreground font-medium">супроводу</strong> або куратора.
              </p>
            </div>

            <Button 
              onClick={() => { haptics.impact('light'); handleLogin(); }} 
              disabled={loading} 
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground active:scale-[0.98] transition-transform shadow-sm"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти в кабінет'}
            </Button>
          </Card>

          {/* Підказки неточного пошуку */}
          {suggestions.length > 0 && (
            <Card className="p-4 bg-card/90 backdrop-blur-md border-border/60 animate-slide-up space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs font-semibold text-foreground">
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
                      className="w-full p-3 rounded-xl bg-muted/40 hover:bg-muted/70 border border-border/40 text-left transition-all active:scale-[0.98] flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-foreground">{item.full_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Команда №{item.team_number}
                          {item.team_name ? ` · ${item.team_name}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-primary tabular-nums shrink-0 px-2 py-0.5 rounded bg-primary/10">
                        {pct}%
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Якщо твого імені немає — звернись до супроводу.
              </p>
            </Card>
          )}
        </div>
      </div>

      <footer className="text-center py-2 text-[11px] text-muted-foreground/60">
        Залізна Зміна · Система Координації
      </footer>
    </div>
  );
};

export default ChildFlow;
