import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Coins, Loader2, LogOut, Mic2, ArrowLeftRight, Users, ChevronRight, Crown, Sun, Moon, Camera, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { clearSavedSession, saveSession } from '@/lib/session';
import { FullScreenLoader } from '@/components/ui/loader';
import StaffAvatar from '@/components/staff/StaffAvatar';
import { compressAvatar, KIND_LABEL, StaffKind, staffCall as call, staffErr } from '@/lib/staffApi';
import { useInvertedLight, useStaffTheme } from '@/lib/staffTheme';
import { cn } from '@/lib/utils';

const SupervisorFlow = lazy(() => import('@/components/screens/SupervisorFlow'));

interface Assignment {
  id: string;
  team_number: number;
  shift: { id: string; name: string; shift_type: string; start_date: string; end_date: string };
  stats: { children: number; iron_total: number; transfers: number; talents: number };
}
interface Cabinet { full_name: string; login: string; kind: StaffKind; phone: string | null; telegram: string | null; avatar_url: string | null; assignments: Assignment[] }

const todayStr = () => new Date().toLocaleDateString('en-CA');
const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });

const StaffPortal = () => {
  const navigate = useNavigate();
  const [theme, toggleTheme] = useStaffTheme();
  const [booting, setBooting] = useState(true);
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [activeTeam, setActiveTeam] = useState<number | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const inPanel = Boolean(cabinet && activeTeam !== null);
  useInvertedLight(inPanel && theme === 'light');

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
      } catch { /* не супровід, показуємо форму */ }
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

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const data = await compressAvatar(file);
      await call({ action: 'update_profile', avatar_url: data });
      setCabinet((c) => (c ? { ...c, avatar_url: data } : c));
      toast.success('Фото оновлено');
    } catch { toast.error('Не вдалося завантажити фото'); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
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

  if (inPanel) {
    return (
      <Suspense fallback={<FullScreenLoader label="Відкриваємо зміну..." />}>
        <SupervisorFlow
          cabinetMode
          onBack={() => { setActiveTeam(null); loadCabinet().catch(() => {}); }}
          onAdminUnlock={() => navigate('/')}
        />
      </Suspense>
    );
  }

  const ThemeBtn = (
    <button onClick={toggleTheme} aria-label={theme === 'light' ? 'Темна тема' : 'Світла тема'}
      className="w-10 h-10 rounded-full border border-border bg-card grid place-items-center text-foreground active:scale-95 transition-transform">
      {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );

  return (
    <main className={cn('min-h-[100dvh] w-full bg-background text-foreground px-4 py-6 safe-top transition-colors', theme === 'light' && 'staff-light')}>
      <div className="max-w-md mx-auto space-y-5">
        {!cabinet ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-tight">{adminMode ? 'Вхід адміністратора' : 'Вхід для супроводу'}</h1>
                <p className="text-sm text-muted-foreground mt-1">{adminMode ? 'Введіть пароль адміністратора' : 'Особистий логін і пароль'}</p>
              </div>
              {ThemeBtn}
            </div>
            <div className="p-5 space-y-4 rounded-3xl bg-card border border-border">
              {!adminMode && (
                <div className="space-y-1.5">
                  <Label htmlFor="login" className="text-xs font-semibold">Логін</Label>
                  <Input id="login" autoComplete="username" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)}
                    className="h-12 rounded-xl" placeholder="напр. olena.k" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="pass" className="text-xs font-semibold">Пароль</Label>
                <Input id="pass" type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="h-12 rounded-xl" placeholder="••••••••" />
              </div>
              <Button onClick={() => { if (adminMode && !login) setLogin('admin'); handleLogin(); }} disabled={busy}
                className="w-full h-12 font-bold rounded-xl">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Увійти'}
              </Button>
            </div>
            <button onClick={() => { setAdminMode((v) => !v); setLogin(adminMode ? '' : 'admin'); }}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Crown className="w-3.5 h-3.5" /> {adminMode ? 'Я супровід' : 'Я адміністратор'}
            </button>
          </>
        ) : (
          <>
            <header className="flex items-center gap-3">
              <button onClick={() => fileRef.current?.click()} className="relative shrink-0 active:scale-95 transition-transform" aria-label="Змінити фото">
                <StaffAvatar name={cabinet.full_name} src={cabinet.avatar_url} size={60} />
                <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center ring-2 ring-background">
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-black truncate leading-tight">{cabinet.full_name}</h1>
                <p className="text-xs text-muted-foreground">{KIND_LABEL[cabinet.kind ?? 'supervisor']}, @{cabinet.login}</p>
              </div>
              {ThemeBtn}
            </header>

            <div className="flex gap-2 min-w-0">
              <Button variant="secondary" className="flex-1 min-w-0 rounded-xl" onClick={() => setProfileOpen(true)}>
                <Pencil className="w-4 h-4 mr-1.5" /> Мої контакти
              </Button>
              <Button variant="secondary" onClick={logout} className="flex-1 min-w-0 rounded-xl">
                <LogOut className="w-4 h-4 mr-1.5" /> Вийти
              </Button>
            </div>

            {cabinet.assignments.length === 0 && (
              <div className="p-5 rounded-2xl bg-card border border-border text-sm text-muted-foreground">
                Вас ще не призначено на жодну зміну. Штаб додасть вас до команди.
              </div>
            )}

            <Section title="Зараз" items={groups.current} onEnter={enterShift} busy={busy} tone="live" />
            <Section title="Майбутні" items={groups.upcoming} onEnter={enterShift} busy={busy} tone="soon" />
            <Section title="Минулі" items={groups.past} onEnter={enterShift} busy={busy} tone="past" />

            <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} cabinet={cabinet} light={theme === 'light'}
              onSaved={(p) => setCabinet((c) => (c ? { ...c, ...p } : c))} onRemovePhoto={async () => {
                try { await call({ action: 'update_profile', avatar_url: null }); setCabinet((c) => (c ? { ...c, avatar_url: null } : c)); toast.success('Фото прибрано'); }
                catch (e) { toast.error(staffErr(e)); }
              }} />
          </>
        )}
      </div>
    </main>
  );
};

const ProfileSheet = ({ open, onClose, cabinet, light, onSaved, onRemovePhoto }: {
  open: boolean; onClose: () => void; cabinet: Cabinet; light: boolean;
  onSaved: (p: { phone: string | null; telegram: string | null }) => void; onRemovePhoto: () => void;
}) => {
  const [phone, setPhone] = useState(cabinet.phone ?? '');
  const [tg, setTg] = useState(cabinet.telegram ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPhone(cabinet.phone ?? ''); setTg(cabinet.telegram ?? ''); } }, [open, cabinet]);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className={cn('rounded-t-3xl', light && 'staff-light bg-background text-foreground')}>
        <SheetHeader><SheetTitle>Мої контакти</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 max-w-md mx-auto">
          <div className="space-y-1.5"><Label className="text-xs">Телефон</Label><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Telegram</Label><Input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="@нік" className="h-11" /></div>
          <Button className="w-full h-11 rounded-xl" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await call({ action: 'update_profile', phone, telegram: tg }); onSaved({ phone, telegram: tg.replace(/^@/, '') || null }); toast.success('Збережено'); onClose(); }
            catch (e) { toast.error(staffErr(e)); }
            setBusy(false);
          }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Зберегти'}</Button>
          {cabinet.avatar_url && <button onClick={onRemovePhoto} className="w-full text-xs text-muted-foreground underline">Прибрати фото</button>}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Section = ({ title, items, onEnter, busy, tone }: {
  title: string; items: Assignment[]; onEnter: (a: Assignment) => void; busy: boolean; tone: 'live' | 'soon' | 'past';
}) => {
  if (!items.length) return null;
  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-bold text-muted-foreground">{title} <span className="opacity-60">{items.length}</span></h2>
      {items.map((a) => (
        <div key={a.id} className={cn('p-4 rounded-xl bg-card border space-y-3', tone === 'live' ? 'border-primary/50' : 'border-border', tone === 'past' && 'opacity-80')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold truncate">{a.shift.name}</p>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                <CalendarDays className="w-3.5 h-3.5" /> {fmt(a.shift.start_date)} - {fmt(a.shift.end_date)}
              </p>
            </div>
            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap',
              tone === 'live' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>Команда №{a.team_number}</span>
          </div>
          <div className="grid grid-cols-2 min-[390px]:grid-cols-4 gap-2 text-center">
            <Stat icon={<Users className="w-3.5 h-3.5" />} label="Дітей" value={a.stats.children} />
            <Stat icon={<Coins className="w-3.5 h-3.5" />} label="А$" value={a.stats.iron_total} />
            <Stat icon={<ArrowLeftRight className="w-3.5 h-3.5" />} label="Трансф." value={a.stats.transfers} />
            <Stat icon={<Mic2 className="w-3.5 h-3.5" />} label="Таланти" value={a.stats.talents} />
          </div>
          {tone !== 'past' && (
            <Button onClick={() => onEnter(a)} disabled={busy} className="w-full h-11 rounded-xl font-bold">
              Увійти в зміну <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      ))}
    </section>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="rounded-xl bg-muted/60 py-2">
    <div className="flex justify-center text-primary">{icon}</div>
    <p className="text-sm font-black">{value}</p>
    <p className="text-[10px] text-muted-foreground">{label}</p>
  </div>
);

export default StaffPortal;
