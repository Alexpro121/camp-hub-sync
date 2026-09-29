import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Coins, Loader2, LogOut, Mic2, ArrowLeftRight, Users, ChevronRight, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { clearSavedSession, saveSession } from '@/lib/session';
import SupervisorFlow from '@/components/screens/SupervisorFlow';
import { FullScreenLoader } from '@/components/ui/loader';

interface Assignment {
  id: string;
  team_number: number;
  shift: { id: string; name: string; shift_type: string; start_date: string; end_date: string };
  stats: { children: number; iron_total: number; transfers: number; talents: number };
}
interface Cabinet { full_name: string; login: string; assignments: Assignment[] }

const todayStr = () => new Date().toLocaleDateString('en-CA');
const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('staff-accounts', { body }).catch((e) => ({ data: null as any, error: e }));
  if (error || data?.error) throw new Error(data?.error || 'failed');
  return data;
}

const StaffPortal = () => {
  const navigate = useNavigate();
  const [booting, setBooting] = useState(true);
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [activeTeam, setActiveTeam] = useState<number | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const loadCabinet = useCallback(async () => {
    const data = await call({ action: 'cabinet' });
    setCabinet(data as Cabinet);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await loadCabinet();
          const savedTeam = localStorage.getItem('helpsuprov:supervisor-team');
          if (savedTeam) setActiveTeam(parseInt(savedTeam, 10));
        }
      } catch { /* не супровід — показуємо форму */ }
      setBooting(false);
    })();
  }, [loadCabinet]);

  const handleLogin = async () => {
    if (!login.trim() || !password) { toast.error('Введіть логін та пароль'); return; }
    setBusy(true);
    try {
      if (adminMode) {
        const { data, error } = await supabase.functions.invoke('staff-login', { body: { team: 99, password } }).catch((e) => ({ data: null as any, error: e }));
        if (error || data?.role !== 'admin') throw new Error();
        await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
        saveSession('admin');
        navigate('/');
        return;
      }
      const data = await call({ action: 'login', login: login.trim(), password });
      await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      await loadCabinet();
      toast.success(`Вітаємо, ${data.full_name}!`);
    } catch (e: any) {
      toast.error(e?.message === 'too_many_attempts' ? 'Забагато спроб. Зачекайте хвилину' : 'Невірний логін або пароль');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    localStorage.removeItem('helpsuprov:supervisor-team');
    clearSavedSession();
    await supabase.auth.signOut();
    setCabinet(null);
    setActiveTeam(null);
    setPassword('');
  };

  const enterShift = async (a: Assignment) => {
    setBusy(true);
    try {
      const res = await call({ action: 'enter_shift', assignment_id: a.id });
      localStorage.setItem('helpsuprov:supervisor-team', String(res.team));
      saveSession('supervisor', { teamNumber: res.team, shiftId: res.shift_id });
      setActiveTeam(res.team);
    } catch {
      toast.error('Не вдалося відкрити зміну');
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const t = todayStr();
    const list = cabinet?.assignments ?? [];
    return {
      current: list.filter((a) => a.shift.start_date <= t && a.shift.end_date >= t),
      upcoming: list.filter((a) => a.shift.start_date > t).sort((a, b) => a.shift.start_date.localeCompare(b.shift.start_date)),
      past: list.filter((a) => a.shift.end_date < t).sort((a, b) => b.shift.end_date.localeCompare(a.shift.end_date)),
    };
  }, [cabinet]);

  if (booting) return <FullScreenLoader label="Завантаження кабінету..." />;

  if (cabinet && activeTeam !== null) {
    return (
      <SupervisorFlow
        cabinetMode
        onBack={() => { setActiveTeam(null); loadCabinet().catch(() => {}); }}
        onAdminUnlock={() => navigate('/')}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] w-full bg-[#07090E] text-slate-100 px-4 py-6 safe-top">
      <div className="max-w-md mx-auto space-y-5">
        {!cabinet ? (
          <>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FA5A15]/10 border border-[#FA5A15]/20 text-[10px] font-bold tracking-widest text-[#FA5A15] uppercase mb-2">
                {adminMode ? 'Штаб' : 'Кабінет супроводу'}
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">{adminMode ? 'Вхід адміністратора' : 'Вхід для супроводу'}</h1>
              <p className="text-xs text-slate-400 mt-1">{adminMode ? 'Введіть пароль адміністратора' : 'Використайте особистий логін і пароль, які видав штаб'}</p>
            </div>
            <Card className="p-5 space-y-4 rounded-3xl bg-[#0F1523]/85 border-white/10">
              {!adminMode && (
                <div className="space-y-1.5">
                  <Label htmlFor="login" className="text-xs font-semibold text-white">Логін</Label>
                  <Input id="login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)}
                    className="h-12 rounded-xl bg-white/5 border-white/10 text-white" placeholder="напр. olena.k" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="pass" className="text-xs font-semibold text-white">Пароль</Label>
                <Input id="pass" type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="h-12 rounded-xl bg-white/5 border-white/10 text-white" placeholder="••••••••" />
              </div>
              <Button onClick={() => { if (adminMode && !login) setLogin('admin'); handleLogin(); }} disabled={busy}
                className="w-full h-12 font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти'}
              </Button>
            </Card>
            <button onClick={() => { setAdminMode((v) => !v); setLogin(adminMode ? '' : 'admin'); }}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
              <Crown className="w-3.5 h-3.5" /> {adminMode ? 'Я супровід' : 'Я адміністратор'}
            </button>
          </>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#FA5A15]">Особистий кабінет</p>
                <h1 className="text-xl font-black text-white truncate">{cabinet.full_name}</h1>
                <p className="text-xs text-slate-500">@{cabinet.login}</p>
              </div>
              <Button variant="outline" onClick={logout} className="rounded-xl border-white/10 bg-white/5 text-slate-200">
                <LogOut className="w-4 h-4 mr-1.5 text-[#FA5A15]" /> Вийти
              </Button>
            </header>

            {cabinet.assignments.length === 0 && (
              <Card className="p-5 rounded-2xl bg-[#0F1523]/85 border-white/10 text-sm text-slate-400">
                Вас ще не призначено на жодну зміну. Зверніться до штабу.
              </Card>
            )}

            <Section title="Поточні" items={groups.current} onEnter={enterShift} busy={busy} tone="live" />
            <Section title="Майбутні" items={groups.upcoming} onEnter={enterShift} busy={busy} tone="soon" />
            <Section title="Минулі" items={groups.past} onEnter={enterShift} busy={busy} tone="past" />
          </>
        )}
      </div>
    </main>
  );
};

const Section = ({ title, items, onEnter, busy, tone }: {
  title: string; items: Assignment[]; onEnter: (a: Assignment) => void; busy: boolean; tone: 'live' | 'soon' | 'past';
}) => {
  if (!items.length) return null;
  const badge = tone === 'live' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    : tone === 'soon' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-white/5 text-slate-400 border-white/10';
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title} · {items.length}</h2>
      {items.map((a) => (
        <Card key={a.id} className="p-4 rounded-2xl bg-[#0F1523]/85 border-white/10 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-white truncate">{a.shift.name}</p>
              <p className="text-xs text-slate-400 inline-flex items-center gap-1 mt-0.5">
                <CalendarDays className="w-3.5 h-3.5" /> {fmt(a.shift.start_date)} — {fmt(a.shift.end_date)}
              </p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${badge}`}>Команда №{a.team_number}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat icon={<Users className="w-3.5 h-3.5" />} label="Дітей" value={a.stats.children} />
            <Stat icon={<Coins className="w-3.5 h-3.5" />} label="А$" value={a.stats.iron_total} />
            <Stat icon={<ArrowLeftRight className="w-3.5 h-3.5" />} label="Трансф." value={a.stats.transfers} />
            <Stat icon={<Mic2 className="w-3.5 h-3.5" />} label="Таланти" value={a.stats.talents} />
          </div>
          {tone !== 'past' && (
            <Button onClick={() => onEnter(a)} disabled={busy}
              className="w-full h-11 rounded-xl font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white">
              Увійти в зміну <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </Card>
      ))}
    </section>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="rounded-xl bg-white/5 border border-white/10 py-2">
    <div className="flex justify-center text-[#FA5A15]">{icon}</div>
    <p className="text-sm font-black text-white">{value}</p>
    <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
  </div>
);

export default StaffPortal;
