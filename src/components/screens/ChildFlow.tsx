import { useEffect, useState } from 'react';
import { ArrowLeft, Coins, User, Phone, Hash, Users, FileText, Loader2, Shield, Check, ChevronDown, HelpCircle } from 'lucide-react';
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
import { Mic2 } from 'lucide-react';
import { useTeamPhase } from '@/hooks/useTeamPhase';
import PhaseBanner from '@/components/shift/PhaseBanner';

interface Props { onBack: () => void; }

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
  const [suggestions, setSuggestions] = useState<NameSuggestion<Candidate>[]>([]);
  const haptics = useHaptics();
  const talent = useTalentEventActive();
  const { status: phase } = useTeamPhase(child?.team_number ?? null);

  // App-wide schedule alerts: the island pops on any screen once logged in.
  useScheduleNotifier(child?.team_number ?? null, !!child);

  // Realtime updates for the logged-in child
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

  const loginAs = async (candidate: { id: string }) => {
    setLoading(true);
    try {
      // The backend verifies the record, issues a scoped session and marks the login.
      const { data, error } = await supabase.functions.invoke('child-login', {
        body: { action: 'claim', childId: candidate.id },
      });
      if (error || !data?.session) throw new Error('Не вдалося увійти');

      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      // With the session in place, the child can read only their own record.
      const { data: row, error: rowErr } = await supabase
        .from('children')
        .select('*')
        .eq('id', candidate.id)
        .single();
      if (rowErr || !row) throw new Error('Не вдалося завантажити профіль');

      setChild(row as Child);
      setStep('profile');
      setSuggestions([]);
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
      // Searching happens server-side so the participant list is never exposed publicly.
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



  if (step === 'profile' && child) {
    const rawEntries = child.raw_data && typeof child.raw_data === 'object'
      ? Object.entries(child.raw_data as Record<string, any>)
      : [];

    return (
      <div className="min-h-screen px-4 py-4 max-w-md mx-auto safe-top safe-bottom">
        <button
          onClick={() => { haptics.impact('light'); handleExit(); }}
          className="flex items-center gap-2 text-sm text-muted-foreground mb-3 hover:text-foreground transition-smooth active:scale-[0.98]"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Вийти
        </button>

        {/* Identity card */}
        <Card className="p-4 mb-3 bg-card/80 backdrop-blur-md border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Залізна зміна
              </span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
              ID·{child.id.slice(0, 6).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
                <User className="w-7 h-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              {child.has_logged_in && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-success border-2 border-card flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-success-foreground" strokeWidth={2.5} />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold leading-tight break-words">{child.full_name}</h1>
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                Команда {child.team_number}{child.team_name ? ` · ${child.team_name}` : ''}
              </p>
            </div>
          </div>

          {/* Iron dollars */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span className="text-xs text-muted-foreground">Айрон-долари</span>
            </div>
            <span className="font-mono text-3xl font-semibold tabular-nums leading-none">
              {child.iron_dollars}
            </span>
          </div>
        </Card>

        <Tabs
          defaultValue="profile"
          className="w-full"
          onValueChange={(v) => { haptics.impact('light'); if (v === 'talent') talent.markSeen(); }}
        >
          <TabsList className={`grid ${talent.active ? 'grid-cols-3' : 'grid-cols-2'} w-full h-11 mb-3`}>
            <TabsTrigger value="profile" className="text-xs min-h-[40px]">Профіль</TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs min-h-[40px]">Розклад</TabsTrigger>
            {talent.active && (
              <TabsTrigger value="talent" className="text-xs min-h-[40px] relative animate-fade-in gap-1.5">
                <Mic2 className="w-4 h-4" strokeWidth={1.9} /> Таланти
                {talent.isNew && <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-warning animate-pulse" />}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="space-y-3 mt-0">
            {phase && <PhaseBanner status={phase} teamNumber={child.team_number} />}
            {(!phase || phase.currentPhase !== 'PREPARING') && <ChildCoupeCard childId={child.id} />}

            <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
                Дані
              </p>
              <div className="space-y-3">
                <InfoRow icon={<Hash className="w-4 h-4" strokeWidth={1.75} />} label="№ в списку" value={child.row_number?.toString() || '—'} />
                <InfoRow icon={<Users className="w-4 h-4" strokeWidth={1.75} />} label="Команда" value={child.team_name || String(child.team_number)} />
                <InfoRow icon={<Phone className="w-4 h-4" strokeWidth={1.75} />} label="Телефон" value={child.phone || '—'} />
                {child.note_from_table && (
                  <InfoRow icon={<FileText className="w-4 h-4" strokeWidth={1.75} />} label="Примітка" value={child.note_from_table} />
                )}
              </div>
            </Card>

            {rawEntries.length > 0 && (
              <Card className="p-0 bg-card/80 backdrop-blur-md border-border/50 overflow-hidden">
                <button
                  onClick={() => { haptics.impact('light'); setShowAllFields((v) => !v); }}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-muted/40 transition-smooth active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                    <span className="text-xs font-medium tabular-nums">
                      Усі поля з таблиці · {rawEntries.length}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-smooth ${showAllFields ? 'rotate-180' : ''}`} strokeWidth={1.75} />
                </button>
                {showAllFields && (
                  <div className="border-t border-border/40 divide-y divide-border/30 max-h-80 overflow-y-auto scrollbar-thin">
                    {rawEntries.map(([k, v]) => (
                      <div key={k} className="flex items-start gap-3 p-3">
                        <span className="text-[11px] text-muted-foreground min-w-[40%] truncate">{k}</span>
                        <span className="text-xs break-words flex-1">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <p className="text-center text-[10px] text-muted-foreground/60">
              Дані оновлюються в реальному часі
            </p>
          </TabsContent>

          <TabsContent value="schedule" className="mt-0">
            {phase?.currentPhase === 'PREPARING' ? (
              <PhaseBanner status={phase} teamNumber={child.team_number} />
            ) : (
              <ScheduleView myTeam={child.team_number} lockTeam />
            )}
          </TabsContent>
          {talent.active && (
            <TabsContent value="talent" className="mt-0">
              <TalentTeamView myTeam={child.team_number} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 max-w-md mx-auto safe-top safe-bottom">
      {loading && <FullScreenLoader label="Шукаємо тебе" />}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground transition-smooth active:scale-[0.98]">
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <div className="animate-slide-up">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Я дитина</h1>
        <p className="text-muted-foreground text-sm mb-5">Введи дані для входу</p>

        <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">ПІБ</Label>
            <Input
              id="name"
              placeholder="Іванов Іван Іванович"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); if (suggestions.length) setSuggestions([]); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team" className="flex items-center gap-1.5">
              Номер команди
            </Label>
            <Input
              id="team"
              type="number"
              inputMode="numeric"
              placeholder="12"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="h-12 text-base"
            />
            <p className="text-[10px] text-muted-foreground/70 leading-snug">
              Не пам'ятаєш команду? Запитай у свого супроводу.
            </p>
          </div>
          <Button onClick={() => { haptics.impact('light'); handleLogin(); }} disabled={loading} className="w-full h-12 text-base font-medium active:scale-[0.98] transition-transform">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти'}
          </Button>
        </Card>

        {/* Fuzzy suggestions — "did you mean?" */}
        {suggestions.length > 0 && (
          <Card className="mt-3 p-4 bg-card/80 backdrop-blur-md border-border/50 animate-slide-up">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium">
                Це ти?
              </p>
            </div>
            <div className="space-y-1.5">
              {suggestions.map(({ item, score }) => {
                const pct = Math.round(score * 100);
                return (
                  <button
                    key={item.id}
                    onClick={() => { haptics.impact('light'); loginAs(item); }}
                    className="w-full p-3 rounded-lg bg-surface-1 hover:bg-muted/60 border border-border/40 text-left transition-smooth active:scale-[0.98] flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Команда {item.team_number}
                        {item.team_name ? ` · ${item.team_name}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-primary/80 tabular-nums shrink-0">
                      {pct}%
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-3 text-center">
              Якщо тебе тут немає — перевір ПІБ або звернись до супроводу.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-3">
    <div className="text-primary/70 mt-0.5">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  </div>
);

export default ChildFlow;
