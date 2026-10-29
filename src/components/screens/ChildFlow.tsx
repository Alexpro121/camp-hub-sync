import { lazyRetry } from '@/lib/lazyRetry';
import { GENDER_LABEL } from '@/lib/gender';
import { UserRound } from 'lucide-react';
import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Moon,
  Award,
  Sparkles
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
import IronPixelAvatar from '@/components/ui/IronPixelAvatar';
import IronAvatarReveal from '@/components/ui/IronAvatarReveal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
const ChildCoupeCard = lazyRetry(() => import('@/components/coupes/ChildCoupeCard'));
import { TRAIN_FEATURE_ENABLED } from '@/lib/trips';
import ScheduleView from '@/components/schedule/ScheduleView';
import { useScheduleNotifier } from '@/hooks/useScheduleNotifier';
import ExitConfirm from '@/components/ExitConfirm';
import ChildPass from '@/components/child/ChildPass';
import { useTalentEventActive } from '@/hooks/useTalentEventActive';
import { useAggressiveFairUnlock } from '@/hooks/useAggressiveFairUnlock';
import { FAIR_FEATURE_ENABLED } from '@/lib/fair';
const ChildFairCard = lazyRetry(() => import('@/components/fair/ChildFairCard'));
import TransactionHistory from '@/components/fair/TransactionHistory';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { 
  clearSavedSession, 
  getSavedChildId, 
  getSavedRole, 
  saveSession, 
  getChildArchiveSnapshot,
  saveChildArchiveSnapshot,
} from '@/lib/session';
import { CertificateModal } from '@/components/certificate/CertificateModal';

interface Props { 
  onBack: () => void; 
}

interface Candidate {
  id: string;
  full_name: string;
  team_number: number;
  team_name: string | null;
}

/** Виклик входу з повтором: під піковим навантаженням (300+ дітей одночасно) сервер іноді відповідає 5xx */
async function invokeLogin(body: Record<string, unknown>) {
  let last: any = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await supabase.functions.invoke('child-login', { body });
    const status = (res.error as any)?.context?.status ?? 0;
    if (!res.error || (status && status < 500 && status !== 0)) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt + Math.random() * 600));
  }
  return last;
}

const ChildFlow = ({ onBack }: Props) => {
  const [step, setStep] = useState<'login' | 'profile'>('login');
  const [fullName, setFullName] = useState('');
  const [team, setTeam] = useState('');
  const [loading, setLoading] = useState(false);
  const [child, setChild] = useState<Child | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'schedule' | 'fair' | 'talent'>('profile');
  const [suggestions, setSuggestions] = useState<NameSuggestion<Candidate>[]>([]);
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [isRevealingAvatar, setIsRevealingAvatar] = useState(false);

  // Керування темою оформлення для кабінету учасника
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('child_theme_mode');
    return saved ? saved === 'dark' : true;
  });

  const haptics = useHaptics();
  const island = useDynamicIsland();
  const talent = useTalentEventActive();
  const fair = useAggressiveFairUnlock(FAIR_FEATURE_ENABLED && !!child);

  // Сповіщення про події розкладу у Dynamic Island
  useScheduleNotifier(child?.team_number ?? null, !!child);

  // Перший вхід учасника — кінематографічна генерація піксельного аватара
  useEffect(() => {
    if (!child?.id) return;
    try {
      if (!localStorage.getItem(`iron:avatar-revealed:${child.id}`)) {
        setIsRevealingAvatar(true);
      }
    } catch { /* сховище недоступне */ }
  }, [child?.id]);


  // Синхронізація теми + автоматичне повернення темної теми для адміна/супроводу при виході
  useEffect(() => {
    localStorage.setItem('child_theme_mode', isDark ? 'dark' : 'light');
    return () => {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    };
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    haptics.impact('light');
    setIsDark((prev) => !prev);
  }, [haptics]);

  // Автоматичний вхід при збереженій дійсній сесії або офлайн-паспорті
  useEffect(() => {
    let cancelled = false;
    const fallbackToSnapshot = (savedId: string) => {
      const snapshot = getChildArchiveSnapshot();
      if (snapshot && snapshot.child.id === savedId && !cancelled) {
        setChild(snapshot.child);
        setStep('profile');
      }
    };
    (async () => {
      const savedId = getSavedRole() === 'child' ? getSavedChildId() : null;
      if (!savedId) return;

      try {
        const { data: sess } = await supabase.auth.getSession();
        if (cancelled) return;
        // Сесія закінчилась (зміна завершена) — показуємо збережений профіль
        if (!sess.session) { fallbackToSnapshot(savedId); return; }

        const { data: row, error } = await supabase.from('children').select('*').eq('id', savedId).maybeSingle();
        if (cancelled) return;

        // Немає мережі / дитину видалили після зміни — профіль з пристрою
        if (error || !row) { fallbackToSnapshot(savedId); return; }

        setChild(row as Child);
        setStep('profile');
      } catch {
        fallbackToSnapshot(savedId);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Постійне збереження профілю на пристрої (переживає кінець зміни)
  useEffect(() => {
    if (!child?.id || !child.full_name) return;
    const prev = getChildArchiveSnapshot();
    const sameChild = prev?.child.id === child.id;
    saveChildArchiveSnapshot(child, sameChild ? prev!.transactions : [], {
      schedule: sameChild ? prev!.schedule : undefined,
      coupe: sameChild ? prev!.coupe : null,
    });
  }, [child]);

  // Якщо ярмарок вимкнули, а дитина була на вкладці "Ярмарок" — плавно повертаємо на "Профіль"
  useEffect(() => {
    if ((!FAIR_FEATURE_ENABLED || !fair.isLiveFairRunning) && activeTab === 'fair') {
      setActiveTab('profile');
    }
  }, [fair.isLiveFairRunning, activeTab]);

  // Realtime слухач оновлень профілю учасника
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

  // Realtime сповіщення про нарахування коштів через Dynamic Island
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
          island.showSuccess(`+${tx.amount_change} А$`, tx.reason || 'Нараховано супроводом');
          haptics.notification('success');
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [child?.id, island, haptics]);

  const loginAs = async (candidate: { id: string; ticket?: string }) => {
    setLoading(true);
    try {
      const { data, error } = await invokeLogin({ action: 'claim', childId: candidate.id, ticket: candidate.ticket });
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
    if (fullName.trim().length < 2) {
      toast.error('Введи своє імʼя так, як воно є у списку');
      return;
    }

    if (!team.replace(/[^\d]/g, '')) {
      toast.error('Введи номер команди');
      return;
    }

    setLoading(true);
    setSuggestions([]);
    try {
      const { data, error } = await invokeLogin({ action: 'search', fullName: fullName.trim(), team });
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
    haptics.impact('light');
    Promise.resolve(navigator.clipboard?.writeText(text))
      .then(() => toast.success(label))
      .catch(() => toast.error('Не вдалося скопіювати'));
  };


  // Розрахунок кількості колонок для вкладок (тільки реально активні модулі)
  const tabColumnsCount = useMemo(() => {
    let count = 2; // Профіль + Розклад
    if (FAIR_FEATURE_ENABLED && fair.isLiveFairRunning) count += 1;
    if (talent.active) count += 1;
    return count;
  }, [fair.isLiveFairRunning, talent.active]);

  /* =========================================================================
     ЕКРАН 1: КАБІНЕТ УЧАСНИКА (АВТОРИЗОВАНИЙ СТАН)
  ========================================================================= */
  if (step === 'profile' && child) {
    const formatRaw = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return ''; } }
      return String(v).trim();
    };
    const rawEntries = (child.raw_data && typeof child.raw_data === 'object'
      ? Object.entries(child.raw_data as Record<string, unknown>)
      : [])
      .map(([k, v]) => [k.trim(), formatRaw(v)] as const)
      .filter(([k, v]) => k && v);

    const shortId = child.id.slice(0, 6).toUpperCase();
    const genderLabel = child.gender ? (GENDER_LABEL[child.gender as keyof typeof GENDER_LABEL] ?? null) : null;

    const t = isDark
      ? { page: 'bg-[#0B0D12] text-slate-100', card: 'bg-[#12151C] border-white/[0.07]', muted: 'text-slate-400', faint: 'text-slate-500', strong: 'text-white', line: 'divide-white/[0.06] border-white/[0.06]', btn: 'bg-[#12151C] border-white/[0.08] text-slate-200 hover:bg-[#181C25]', press: 'hover:bg-white/[0.03] active:bg-white/[0.05]' }
      : { page: 'bg-[#EEF0F3] text-slate-900', card: 'bg-white border-slate-200', muted: 'text-slate-500', faint: 'text-slate-400', strong: 'text-slate-900', line: 'divide-slate-100 border-slate-100', btn: 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50', press: 'hover:bg-slate-50 active:bg-slate-100' };

    const Row = ({ label, value, mono, onClick }: { label: string; value: string; mono?: boolean; onClick?: () => void }) => {
      const body = (
        <>
          <span className={`text-[13px] shrink-0 ${t.muted}`}>{label}</span>
          <span className={`text-[14px] font-medium text-right break-words min-w-0 ${t.strong} ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</span>
        </>
      );
      return onClick ? (
        <button type="button" onClick={onClick} className={`w-full flex items-start justify-between gap-4 px-4 py-3 min-h-[44px] text-left transition-colors ${t.press}`}>{body}</button>
      ) : (
        <div className="flex items-start justify-between gap-4 px-4 py-3 min-h-[44px]">{body}</div>
      );
    };

    return (
      <div className={`relative min-h-[100dvh] w-full max-w-md mx-auto px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] safe-top flex flex-col gap-4 overflow-x-hidden transition-colors duration-300 ${t.page}`}>
        <header className="flex items-center justify-between gap-2">
          <ExitConfirm onConfirm={() => { haptics.impact('light'); handleExit(); }}>
            <button className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border text-[13px] font-medium transition-colors active:scale-[0.97] ${t.btn}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={2} />
              Вийти
            </button>
          </ExitConfirm>
          <button
            onClick={toggleTheme}
            aria-label={isDark ? 'Світла тема' : 'Темна тема'}
            className={`min-h-[40px] min-w-[40px] rounded-xl border flex items-center justify-center transition-colors active:scale-[0.97] ${t.btn}`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        <ChildPass
          name={child.full_name}
          teamNumber={child.team_number}
          teamName={child.team_name}
          balance={child.iron_dollars}
          shortId={shortId}
          isDark={isDark}
          onCertificate={() => { haptics.impact('light'); setCertModalOpen(true); }}
          onCopyId={() => handleCopy(shortId, `ID ${shortId} скопійовано`)}
        />

        <div className="cp-rise" style={{ animationDelay: '220ms' }}>
        <Tabs
          value={activeTab === 'schedule' || (activeTab === 'fair' && FAIR_FEATURE_ENABLED && fair.isLiveFairRunning) ? activeTab : 'profile'}
          className="w-full"
          onValueChange={(v) => { haptics.impact('light'); setActiveTab(v as any); }}
        >
          <TabsList className={`grid w-full h-11 p-1 rounded-xl border ${FAIR_FEATURE_ENABLED && fair.isLiveFairRunning ? 'grid-cols-3' : 'grid-cols-2'} ${isDark ? 'bg-[#12151C] border-white/[0.07] text-slate-400' : 'bg-slate-200/70 border-slate-200 text-slate-600'}`}>
            <TabsTrigger value="profile" className="text-[13px] min-h-[36px] font-medium rounded-lg">Профіль</TabsTrigger>
            <TabsTrigger value="schedule" className="text-[13px] min-h-[36px] font-medium rounded-lg gap-1.5">
              <Calendar className="w-3.5 h-3.5" />Розклад
            </TabsTrigger>
            {FAIR_FEATURE_ENABLED && fair.isLiveFairRunning && (
              <TabsTrigger value="fair" className="text-[13px] min-h-[36px] font-medium rounded-lg gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5" />Ярмарок
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="space-y-4 mt-4 animate-fade-in">
            {TRAIN_FEATURE_ENABLED && (
              <ChildCoupeCard childId={child.id} teamNumber={child.team_number} />
            )}

            <TransactionHistory childId={child.id} collapsible />

            <section>
              <h2 className={`px-1 mb-2 text-[13px] font-medium ${t.muted}`}>Мої дані</h2>
              <div className={`rounded-2xl border divide-y overflow-hidden ${t.card} ${t.line}`}>
                {child.row_number != null && <Row label="Номер у списку" value={String(child.row_number)} mono />}
                {child.phone && <Row label="Телефон" value={child.phone} mono onClick={() => handleCopy(child.phone!, 'Телефон скопійовано')} />}
                {genderLabel && <Row label="Стать" value={genderLabel} />}
                {child.note_from_table && <Row label="Примітка" value={child.note_from_table} />}
                              </div>
            </section>

            {rawEntries.length > 0 && (
              <section className={`rounded-2xl border overflow-hidden ${t.card}`}>
                <button
                  onClick={() => { haptics.impact('light'); setShowAllFields((v) => !v); }}
                  aria-expanded={showAllFields}
                  className={`w-full flex items-center justify-between px-4 min-h-[48px] transition-colors ${t.press}`}
                >
                  <span className={`flex items-center gap-2.5 text-[14px] font-medium ${t.strong}`}>
                    <FileText className={`w-4 h-4 ${t.faint}`} strokeWidth={1.75} />
                    Дані з анкети
                    <span className={`text-[13px] font-normal ${t.faint}`}>{rawEntries.length}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${t.faint} ${showAllFields ? 'rotate-180' : ''}`} strokeWidth={1.75} />
                </button>
                {showAllFields && (
                  <div className={`border-t divide-y animate-fade-in ${t.line}`}>
                    {rawEntries.map(([k, v]) => (
                      <Row key={k} label={/^команда$/i.test(k) ? 'Категорія' : k} value={v} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="mt-4 space-y-3">
              <ScheduleView
                myTeam={child.team_number}
                lockTeam
                onFairAction={() => {
                  if (FAIR_FEATURE_ENABLED && fair.isLiveFairRunning) setActiveTab('fair');
                }}
              />
          </TabsContent>

          {FAIR_FEATURE_ENABLED && fair.isLiveFairRunning && (
            <TabsContent value="fair" className="mt-4 space-y-3">
              <ChildFairCard childId={child.id} balance={child.iron_dollars} childName={child.full_name} childTeam={child.team_number} isLive={true} />
              <TransactionHistory childId={child.id} />
            </TabsContent>
          )}
        </Tabs>
        </div>

        <footer className={`mt-auto text-center pt-2 text-[11px] ${t.faint}`}>
          Залізна Зміна
        </footer>

        <CertificateModal open={certModalOpen} onClose={() => setCertModalOpen(false)} initialName={child.full_name} />

        {isRevealingAvatar && (
          <IronAvatarReveal
            name={child.full_name}
            onComplete={() => {
              try { localStorage.setItem(`iron:avatar-revealed:${child.id}`, 'true'); } catch { /* ignore */ }
              setIsRevealingAvatar(false);
            }}
          />
        )}
      </div>
    );
  }

  /* =========================================================================
     ЕКРАН 2: ФОРМА ВХОДУ (НЕАВТОРИЗОВАНИЙ СТАН)
  ========================================================================= */
  return (
    <div className={`min-h-[100dvh] w-full max-w-md mx-auto px-4 py-5 safe-top pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col justify-between select-none transition-colors duration-500 overflow-x-hidden ${
      isDark ? 'bg-[#07090E] text-slate-100' : 'bg-[#F4F6F9] text-slate-900'
    }`}>
      {loading && <FullScreenLoader label="Шукаємо твій профіль..." />}
      
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

          <button
            onClick={toggleTheme}
            aria-label="Змінити тему"
            className={`p-2 min-h-[40px] min-w-[40px] rounded-xl border flex items-center justify-center transition-all shadow-sm ${
              isDark 
                ? 'bg-[#0F1523]/80 border-white/10 text-amber-400' 
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>

        <div className="animate-slide-up space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FA5A15]/10 border border-[#FA5A15]/20 text-[10px] font-bold tracking-widest text-[#FA5A15] uppercase mb-2">
              ОСОБИСТИЙ КАБІНЕТ
            </div>
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Я учасник
            </h1>
            <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Введи своє ПІБ та номер команди для входу в проєкт
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
                className={`h-12 text-base rounded-xl ${
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
                className={`h-12 text-base rounded-xl ${
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-[#FA5A15]' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#FA5A15]'
                }`}
              />
              <p className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Не пам'ятаєш номер? Запитай у свого <strong className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>супроводу</strong> команди.
              </p>
            </div>

            <Button 
              onClick={() => { haptics.impact('light'); handleLogin(); }} 
              disabled={loading} 
              className="w-full h-12 text-base font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-transform shadow-md rounded-xl"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти в кабінет'}
            </Button>
          </div>

          {/* Підказки неточного пошуку (Fuzzy Search) */}
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
        Всеукраїнський проєкт «Залізна Зміна» · Система Координації
      </footer>
    </div>
  );
};

export default ChildFlow;
