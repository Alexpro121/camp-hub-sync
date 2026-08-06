import { useEffect, useState } from 'react';
import { ArrowLeft, Coins, User, Phone, Hash, Users, FileText, Loader2, Shield, Train, Cog, Sparkles, ChevronDown, HelpCircle } from 'lucide-react';
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

  const loginAs = async (candidate: { id: string; full_name: string }) => {
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
      toast.success(`Привіт, ${candidate.full_name.split(' ')[0]}!`);
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

      const hits = (data?.suggestions || []) as Array<Candidate & { score: number }>;
      if (!hits.length) {
        toast.error('Нікого схожого не знайдено. Перевір ПІБ.');
        return;
      }

      setSuggestions(hits.map((h) => ({ item: h, score: h.score })));
      toast.message('Знайшли схожі варіанти — обери себе');
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
      <div className="min-h-screen px-4 py-5 max-w-md mx-auto safe-top safe-bottom">
        <button onClick={handleExit} className="flex items-center gap-2 text-sm text-muted-foreground mb-5 hover:text-foreground transition-smooth">
          <ArrowLeft className="w-4 h-4" /> Вийти
        </button>

        {/* ID-CARD HEADER (industrial / iron) */}
        <Card className="relative overflow-hidden p-0 mb-4 bg-gradient-card border-primary/20 animate-scale-in">
          {/* Industrial top stripe */}
          <div className="h-1.5 bg-gradient-primary" />
          {/* Hatched warning corners */}
          <div
            aria-hidden
            className="absolute top-1.5 left-0 right-0 h-2 opacity-30"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, hsl(var(--primary)) 0 8px, transparent 8px 18px)',
            }}
          />
          {/* Subtle gear watermark */}
          <Cog
            aria-hidden
            className="absolute -right-8 -bottom-8 w-48 h-48 text-primary/5"
            strokeWidth={1}
          />

          <div className="relative p-5 pt-7">
            {/* Brand line */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">
                  Залізна Зміна
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                ID·{child.id.slice(0, 6).toUpperCase()}
              </span>
            </div>

            {/* Avatar + name */}
            <div className="flex items-center gap-4 mb-5">
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                  <User className="w-10 h-10 text-primary-foreground" strokeWidth={2.5} />
                </div>
                {child.has_logged_in && (
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-success border-2 border-card flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-success-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Учасник
                </p>
                <h1 className="text-xl font-black leading-tight uppercase mt-0.5 break-words">
                  {child.full_name}
                </h1>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Train className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold text-primary">
                    Команда #{child.team_number}
                  </span>
                  {child.team_name && (
                    <span className="text-xs text-muted-foreground truncate">· {child.team_name}</span>
                  )}
                </div>
              </div>
            </div>

            {/* IRON DOLLARS — game widget */}
            <div className="relative rounded-2xl p-5 bg-background/60 border-2 border-primary/40 shadow-glow overflow-hidden">
              <div
                aria-hidden
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, transparent 0 22px, hsl(var(--primary) / 0.12) 22px 23px)',
                }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-black">
                    Iron Dollars
                  </p>
                  <p className="text-5xl font-black tabular-nums text-gradient-primary leading-none mt-1 drop-shadow-[0_0_18px_hsl(22_95%_55%/0.5)]">
                    {child.iron_dollars}
                  </p>
                </div>
                <div className="relative shrink-0">
                  <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse-glow" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow border-2 border-primary-foreground/20">
                    <Coins className="w-8 h-8 text-primary-foreground" strokeWidth={2.5} />
                  </div>
                </div>
              </div>
              {/* Bolts */}
              <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-primary/40" />
              <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary/40" />
              <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-primary/40" />
              <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-primary/40" />
            </div>
          </div>
        </Card>

        {/* DATA PANEL */}
        <Card className="p-5 mb-4 bg-gradient-card animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">
              Досьє
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            <InfoRow icon={<Hash className="w-4 h-4" />} label="№ в списку" value={child.row_number?.toString() || '—'} />
            <InfoRow icon={<Users className="w-4 h-4" />} label="Команда" value={child.team_name || `#${child.team_number}`} />
            <InfoRow icon={<Phone className="w-4 h-4" />} label="Телефон" value={child.phone || '—'} />
            {child.note_from_table && (
              <InfoRow icon={<FileText className="w-4 h-4" />} label="Примітка" value={child.note_from_table} />
            )}
          </div>
        </Card>

        {/* ALL RAW FIELDS */}
        {rawEntries.length > 0 && (
          <Card className="p-0 mb-4 bg-gradient-card overflow-hidden animate-slide-up">
            <button
              onClick={() => setShowAllFields((v) => !v)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-1/50 transition-smooth"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-wider">
                  Усі поля з таблиці · {rawEntries.length}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-smooth ${showAllFields ? 'rotate-180' : ''}`} />
            </button>
            {showAllFields && (
              <div className="border-t border-border/40 divide-y divide-border/30 max-h-80 overflow-y-auto scrollbar-thin">
                {rawEntries.map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 p-3">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider min-w-[40%] truncate">
                      {k}
                    </span>
                    <span className="text-xs font-medium break-words flex-1">
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <p className="text-center text-[10px] text-muted-foreground/60 uppercase tracking-widest">
          Live · Дані оновлюються в реальному часі
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 max-w-md mx-auto safe-top safe-bottom">
      {loading && <FullScreenLoader label="Шукаємо тебе" />}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground mb-8 hover:text-foreground transition-smooth">
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <div className="animate-slide-up">
        <h1 className="text-3xl font-black uppercase mb-1">Я дитина</h1>
        <p className="text-muted-foreground text-sm mb-8">Введи дані для входу</p>

        <Card className="p-6 bg-gradient-card space-y-5">
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
              Номер команди <span className="text-[10px] text-muted-foreground/70 font-normal normal-case">(необов'язково)</span>
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
              Не пам'ятаєш команду? Можна не вводити — система знайде тебе за ПІБ.
            </p>
          </div>
          <Button onClick={handleLogin} disabled={loading} className="w-full h-12 text-base font-bold uppercase">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти'}
          </Button>
        </Card>

        {/* Fuzzy suggestions — "did you mean?" */}
        {suggestions.length > 0 && (
          <Card className="mt-4 p-4 bg-gradient-card border-primary/40 animate-slide-up">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="w-4 h-4 text-primary" />
              <p className="text-xs font-black uppercase tracking-wider">
                Це ти?
              </p>
            </div>
            <div className="space-y-1.5">
              {suggestions.map(({ item, score }) => {
                const pct = Math.round(score * 100);
                return (
                  <button
                    key={item.id}
                    onClick={() => loginAs(item)}
                    className="w-full p-3 rounded-lg bg-surface-1 hover:bg-surface-2 hover:border-primary/60 border border-border/40 text-left transition-smooth flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{item.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Команда #{item.team_number}
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
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  </div>
);

export default ChildFlow;
