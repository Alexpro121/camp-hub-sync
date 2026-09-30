import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Eye, EyeOff, Sun, Moon, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { KIND_LABEL, StaffKind, staffCall, staffErr } from '@/lib/staffApi';
import { useStaffTheme } from '@/lib/staffTheme';
import { cn } from '@/lib/utils';

const translit: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', 'ʼ': '' };
const suggestLogin = (full: string) => {
  const [last, first] = full.trim().toLowerCase().split(/\s+/);
  if (!last || !first) return '';
  const t = (s: string) => [...s].map((c) => translit[c] ?? (/[a-z0-9]/.test(c) ? c : '')).join('');
  return `${t(first)}.${t(last)}`.slice(0, 40);
};

const StaffRegister = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useStaffTheme();
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');
  const [kind, setKind] = useState<StaffKind>('supervisor');
  const [f, setF] = useState({ full_name: '', phone: '', telegram: '', login: '', password: '' });
  const [loginTouched, setLoginTouched] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    staffCall({ action: 'invite_check', token })
      .then((d) => { setKind(d.kind); setState('ok'); })
      .catch(() => setState('invalid'));
  }, [token]);

  const set = (k: keyof typeof f, v: string) => {
    setError(null);
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'full_name' && !loginTouched) n.login = suggestLogin(v);
      return n;
    });
  };

  const checks = [
    { ok: f.full_name.trim().split(/\s+/).length >= 2, label: 'Прізвище та імʼя' },
    { ok: f.phone.replace(/\D/g, '').length >= 9, label: 'Телефон' },
    { ok: /^[a-z0-9._-]{3,40}$/.test(f.login.trim().toLowerCase()), label: 'Логін латиницею' },
    { ok: f.password.length >= 8, label: 'Пароль від 8 символів' },
  ];
  const ready = checks.every((c) => c.ok);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const d = await staffCall({ action: 'register', token, ...f });
      if (d.session) await supabase.auth.setSession({ access_token: d.session.access_token, refresh_token: d.session.refresh_token });
      toast.success(`Вітаємо, ${d.full_name}! Акаунт створено`);
      navigate('/staff', { replace: true });
    } catch (e) { setError(staffErr(e)); }
    setBusy(false);
  };

  return (
    <main className={cn('min-h-[100dvh] bg-background text-foreground px-4 py-8 safe-top', theme === 'light' && 'staff-light')}>
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Реєстрація</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {state === 'ok' ? <>Роль: <b className="text-primary">{KIND_LABEL[kind]}</b>. Команду призначить штаб.</> : ' '}
            </p>
          </div>
          <button onClick={toggleTheme} aria-label="Тема" className="w-10 h-10 rounded-full border border-border bg-card grid place-items-center active:scale-95 transition-transform">
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>

        {state === 'loading' && <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>}

        {state === 'invalid' && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
            <p className="font-semibold">Посилання більше не діє</p>
            <p className="text-sm text-muted-foreground">Його вичерпали, термін минув або штаб його вимкнув. Попросіть нове посилання.</p>
            <Button variant="secondary" className="w-full rounded-xl" onClick={() => navigate('/staff')}>У мене вже є акаунт</Button>
          </div>
        )}

        {state === 'ok' && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }}>
            <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
              <Fld id="fn" label="ПІБ"><Input id="fn" autoComplete="name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Коваленко Олена Петрівна" className="h-12 rounded-xl" /></Fld>
              <Fld id="ph" label="Телефон"><Input id="ph" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+380 67 123 45 67" className="h-12 rounded-xl" /></Fld>
              <Fld id="tg" label="Telegram" hint="Якщо є"><Input id="tg" value={f.telegram} onChange={(e) => set('telegram', e.target.value)} placeholder="@olena_k" autoCapitalize="none" className="h-12 rounded-xl" /></Fld>
            </div>
            <div className="rounded-3xl border border-border bg-card p-5 space-y-4">
              <Fld id="lg" label="Логін" hint="Для входу"><Input id="lg" autoComplete="username" autoCapitalize="none" value={f.login}
                onChange={(e) => { setLoginTouched(true); set('login', e.target.value); }} placeholder="olena.kovalenko" className="h-12 rounded-xl" /></Fld>
              <Fld id="pw" label="Пароль">
                <div className="relative">
                  <Input id="pw" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} className="h-12 rounded-xl pr-11" />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label="Показати пароль" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Fld>
            </div>

            <ul className="grid grid-cols-2 gap-1.5">
              {checks.map((c) => (
                <li key={c.label} className={cn('flex items-center gap-1.5 text-xs', c.ok ? 'text-foreground' : 'text-muted-foreground')}>
                  <span className={cn('w-4 h-4 rounded-full grid place-items-center', c.ok ? 'bg-primary text-primary-foreground' : 'border border-border')}>
                    {c.ok && <Check className="w-3 h-3" />}
                  </span>{c.label}
                </li>
              ))}
            </ul>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={!ready || busy} className="w-full h-12 rounded-xl font-bold">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Створити акаунт'}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
};

const Fld = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs font-semibold flex justify-between">{label}{hint && <span className="font-normal text-muted-foreground">{hint}</span>}</Label>
    {children}
  </div>
);

export default StaffRegister;
