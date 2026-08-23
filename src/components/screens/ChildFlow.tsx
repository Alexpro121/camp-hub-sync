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
  PhoneCall, 
  Tag, 
  MapPin, 
  ShoppingBag, 
  Mic2 
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
  
  const haptics = useHaptics();
  const island = useDynamicIsland();
  const talent = useTalentEventActive();
  const fair = useAggressiveFairUnlock(!!child);
  const { status: phase } = useTeamPhase(child?.team_number ?? null);

  // Сповіщення про розклад у Dynamic Island
  useScheduleNotifier(child?.team_number ?? null, !!child);

  // Авто-вхід при валідній збереженій сесії
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

  // Копіювання з тактильним відгуком та тостом
  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    haptics.impact('light');
    toast.success(label);
  };

  // Генератор ініціалів
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
      <div className="relative min-h-screen px-3.5 sm:px-4 py-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] max-w-md mx-auto safe-top safe-bottom flex flex-col gap-3">
        
        {/* Верхній навігаційний бар */}
        <div className="flex items-center justify-between select-none">
          <button
            onClick={() => { haptics.impact('light'); handleExit(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card/60 hover:bg-card/90 active:scale-95 border border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
            <span>Вийти</span>
          </button>

          <button
            onClick={() => handleCopy(shortId, `ID ${shortId} скопійовано`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card/60 hover:bg-card/90 active:scale-95 border border-border/40 text-xs font-mono text-muted-foreground hover:text-foreground transition-all"
          >
            <span className="text-muted-foreground/70">ID:</span>
            <span className="font-bold text-foreground tracking-wider">{shortId}</span>
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>

        {/* Головна картка ідентифікації */}
        <Card className="p-4 sm:p-5 bg-card/75 backdrop-blur-md border-border/60 shadow-lg relative overflow-hidden">
          {/* Статусний рядок */}
          <div className="flex items-center justify-between mb-3.5 select-none">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center">
                <Shield className="w-3 h-3 text-primary" strokeWidth={2} />
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.22em] text-muted-foreground uppercase">
                Залізна зміна
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-success/10 border border-success/20 text-[10px] font-semibold text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Учасник
            </span>
          </div>

          {/* Аватар, ПІБ та мітки */}
          <div className="flex items-center gap-3.5 mb-3.5">
            <div className="relative shrink-0">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-surface-1 to-muted border border-border/50 flex items-center justify-center text-foreground font-bold text-base sm:text-lg shadow-inner">
                {getInitials(child.full_name)}
              </div>
              {child.has_logged_in && (
                <span className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-success border-2 border-card flex items-center justify-center shadow">
                  <Check className="w-2.5 h-2.5 text-success-foreground stroke-[3]" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold leading-tight tracking-tight text-foreground truncate">
                {child.full_name}
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="px-2 py-0.5 rounded-md bg-muted/40 border border-border/40 text-[11px] font-medium text-foreground/90">
                  Команда №{child.team_number}
                </span>
                {child.team_name && (
                  <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary">
                    {child.team_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Віджет Айрон-доларів */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-surface-1/60 border border-border/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <Coins className="w-4.5 h-4.5 text-primary" strokeWidth={1.8} />
              </div>
              <div>
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block leading-none">
                  Гаманець
                </span>
                <span className="text-xs font-semibold text-foreground/90 mt-0.5 block">
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

        {/* Навігація вкладками */}
        <Tabs
          defaultValue="profile"
          className="w-full"
          onValueChange={(v) => { haptics.impact('light'); if (v === 'talent') talent.markSeen(); }}
        >
          <TabsList
            className={`grid w-full h-11 mb-2.5 p-1 bg-card/60 backdrop-blur-md border border-border/40 rounded-xl ${
              ['grid-cols-2', 'grid-cols-3', 'grid-cols-4'][
                (talent.active ? 1 : 0) + (fair.hasFairAccess ? 1 : 0)
              ]
            }`}
          >
            <TabsTrigger value="profile" className="text-xs min-h-[36px] font-semibold rounded-lg">
              Профіль
            </TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs min-h-[36px] font-semibold rounded-lg">
              Розклад
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
            <Card className="p-4 bg-card/75 backdrop-blur-md border-border/50 space-y-3">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Персональні дані
                </span>
                <span className="text-[10px] text-success/90 font-medium">Активна зміна</span>
              </div>

              {/* Сітка параметрів: № у списку та Команда */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-surface-1/40 border border-border/40">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-0.5">
                    <Hash className="w-3.5 h-3.5 text-primary" />
                    <span>№ у списку</span>
                  </div>
                  <p className="text-base font-bold font-mono text-foreground">
                    {child.row_number?.toString() || '—'}
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-surface-1/40 border border-border/40">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-0.5">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span>Команда</span>
                  </div>
                  <p className="text-base font-bold text-foreground">
                    №{child.team_number}
                  </p>
                </div>
              </div>

              {/* Контакти та деталі */}
              <div className="space-y-1.5 text-xs pt-0.5">
                {child.team_name && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-1/30 border border-border/30">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Tag className="w-3.5 h-3.5 text-muted-foreground/80" />
                      <span>Категорія:</span>
                    </div>
                    <span className="font-semibold text-foreground">{child.team_name}</span>
                  </div>
                )}

                {child.phone && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-1/30 border border-border/30">
                    <div className="flex items-center gap-2 text-foreground min-w-0 pr-2">
                      <Phone className="w-3.5 h-3.5 text-success/90 shrink-0" />
                      <span className="font-mono font-medium truncate">{child.phone}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopy(child.phone || '', 'Телефон скопійовано')}
                        title="Скопіювати"
                        className="p-1.5 rounded-lg bg-surface-1 hover:bg-muted/60 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`tel:${child.phone}`}
                        title="Подзвонити"
                        className="p-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 active:scale-95 transition-all"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                {child.note_from_table && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-1/30 border border-border/30">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-sky-400/80" />
                      <span>Локація / Примітка:</span>
                    </div>
                    <span className="font-semibold text-foreground break-words text-right">
                      {child.note_from_table}
                    </span>
                  </div>
                )}
              </div>
            </Card>

            {/* Усі поля з таблиці (Акордеон) */}
            {rawEntries.length > 0 && (
              <Card className="p-0 bg-card/75 backdrop-blur-md border-border/50 overflow-hidden">
                <button
                  onClick={() => { haptics.impact('light'); setShowAllFields((v) => !v); }}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors select-none"
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

            <p className="text-center text-[10px] text-muted-foreground/60 select-none pb-1">
              Дані оновлюються в реальному часі
            </p>
          </TabsContent>

          {/* ВМІСТ 2: ЯРМАРОК */}
          {fair.hasFairAccess && (
            <TabsContent value="fair" className="mt-0 space-y-3">
              {fair.isLiveFairRunning ? (
                <ChildFairCard
                  balance={child.iron_dollars}
                  childName={child.full_name}
                  childTeam={child.team_number}
                />
              ) : (
                <Card className="p-4 bg-card/75 backdrop-blur-md border-border/50 space-y-2">
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

          {/* ВМІСТ 3: РОЗКЛАД */}
          <TabsContent value="schedule" className="mt-0">
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

          {/* ВМІСТ 4: ТАЛАНТИ */}
          {talent.active && (
            <TabsContent value="talent" className="mt-0">
              <TalentTeamView myTeam={child.team_number} />
            </TabsContent>
          )}
        </Tabs>

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
    <div className="min-h-screen px-4 py-5 max-w-md mx-auto safe-top safe-bottom flex flex-col justify-between">
      {loading && <FullScreenLoader label="Шукаємо твій профіль..." />}
      
      <div>
        <button 
          onClick={onBack} 
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-muted-foreground mb-6 hover:text-foreground transition-colors active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 text-primary" /> 
          <span>Назад</span>
        </button>

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

          <Card className="p-4 sm:p-5 bg-card/75 backdrop-blur-md border-border/50 space-y-4 shadow-xl">
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
                className="h-12 text-base bg-surface-1/50 border-border/60 focus:border-primary/60"
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
                className="h-12 text-base bg-surface-1/50 border-border/60 focus:border-primary/60"
              />
              <p className="text-[11px] text-muted-foreground/70 leading-snug">
                Не пам'ятаєш команду? Запитай у свого супроводу або куратора.
              </p>
            </div>

            <Button 
              onClick={() => { haptics.impact('light'); handleLogin(); }} 
              disabled={loading} 
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground active:scale-[0.98] transition-transform shadow-md"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти в кабінет'}
            </Button>
          </Card>

          {/* Підказки неточного пошуку (Did you mean?) */}
          {suggestions.length > 0 && (
            <Card className="p-4 bg-card/85 backdrop-blur-md border-border/60 animate-slide-up space-y-3">
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
                      className="w-full p-3 rounded-xl bg-surface-1/80 hover:bg-muted/60 border border-border/40 text-left transition-all active:scale-[0.98] flex items-center gap-3"
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
            </Card>
          )}
        </div>
      </div>

      <footer className="text-center py-2 text-[11px] text-muted-foreground/60 select-none">
        Залізна Зміна · Система Координації
      </footer>
    </div>
  );
};

export default ChildFlow;
