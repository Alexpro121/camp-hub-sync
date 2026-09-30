import { lazyRetry } from '@/lib/lazyRetry';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LogOut, User, CalendarDays, Loader2, ChevronDown, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { saveSession, getSavedRole, getSessionMeta, updateSessionMeta, clearSavedSession } from '@/lib/session';
import { lazy, Suspense } from 'react';

const ScheduleView = lazyRetry(() => import('@/components/schedule/ScheduleView'));

interface ParentInfo {
  child: { id: string; full_name: string; team_number: number; team_name: string | null };
  shift: { name: string; start_date: string; end_date: string } | null;
  supervisors: { full_name: string }[];
}

const ERRORS: Record<string, string> = {
  invalid_name: 'Введіть прізвище та імʼя дитини повністю',
  invalid_phone: 'Перевірте номер телефону',
  not_found: 'Не знайшли дитину з таким ПІБ і номером. Перевірте дані або зверніться до супроводу',
  ambiguous: 'Знайдено кілька збігів. Зверніться до супроводу',
  too_many_attempts: 'Забагато спроб. Спробуйте за хвилину',
};

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }) : '');

const ParentFlow = ({ onBack }: { onBack: () => void }) => {
  const [info, setInfo] = useState<ParentInfo | null>(() => {
    if (getSavedRole() !== 'parent') return null;
    return (getSessionMeta()?.parentInfo as ParentInfo) ?? null;
  });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // null = ще не знаємо, true = номер є в списку, false = номера немає
  const [hasPhone, setHasPhone] = useState<boolean | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const checkSeq = useRef(0);

  // Тихе оновлення даних (супровід міг змінитися)
  useEffect(() => {
    if (!info) return;
    supabase.functions.invoke('parent-login', { body: { action: 'info' } })
      .then(({ data }) => {
        if (data?.child) { setInfo(data); updateSessionMeta({ parentInfo: data, teamNumber: data.child.team_number }); }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Після вводу ПІБ тихо перевіряємо, чи є в дитини номер у списку
  useEffect(() => {
    const name = fullName.trim();
    const seq = ++checkSeq.current;
    setHasPhone(null);
    if (name.split(/\s+/).filter(Boolean).length < 2) return;
    const t = setTimeout(() => {
      supabase.functions.invoke('parent-login', { body: { action: 'check', fullName: name } })
        .then(({ data, error }) => { if (seq === checkSeq.current && !error && typeof data?.has_phone === 'boolean') setHasPhone(data.has_phone); })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [fullName]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('parent-login', {
        body: { fullName, phone, confirmParent: hasPhone === false },
      });
      let code = data?.error as string | undefined;
      if (fnErr) {
        try { code = (await (fnErr as any).context?.json())?.error; } catch { /* ignore */ }
      }
      if (!data?.session) { setError(ERRORS[code || ''] || 'Не вдалося увійти. Спробуйте ще раз'); return; }
      await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      const next: ParentInfo = { child: data.child, shift: data.shift, supervisors: data.supervisors || [] };
      saveSession('parent', { childId: next.child.id, teamNumber: next.child.team_number, parentInfo: next });
      setInfo(next);
    } catch {
      setError('Не вдалося увійти. Спробуйте ще раз');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    clearSavedSession();
    await supabase.auth.signOut().catch(() => {});
    toast.success('Ви вийшли');
    onBack();
  };

  if (!info) {
    const noPhone = hasPhone === false;
    return (
      <div className="min-h-[100dvh] w-full flex flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
        <button onClick={onBack} className="self-start flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors h-10">
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
        <div className="w-full max-w-sm mx-auto my-auto">
          <h1 className="text-2xl font-black text-white tracking-tight">Вхід для батьків</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            {noPhone
              ? 'У цієї дитини в списку немає номера телефону. Просто підтвердіть, що ви її батьки.'
              : 'Введіть ПІБ дитини та номер телефону, вказаний у заявці.'}
          </p>
          <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300">ПІБ дитини</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" maxLength={120}
                placeholder="Коваль Марʼяна Олегівна"
                className="h-12 rounded-2xl bg-white/[0.04] border border-white/10 px-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FA5A15]" />
            </label>
            {!noPhone && (
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-300">Номер телефону</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20}
                  placeholder="+380 67 123 45 67"
                  className="h-12 rounded-2xl bg-white/[0.04] border border-white/10 px-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FA5A15]" />
              </label>
            )}
            {error && <p className="text-sm text-red-400 leading-snug">{error}</p>}
            <button type="submit" disabled={loading || !fullName.trim() || (hasPhone === null && !phone.trim()) || (!noPhone && !phone.trim())}
              className="h-12 mt-1 rounded-2xl bg-[#FA5A15] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : noPhone ? (
                <><ShieldCheck className="w-4 h-4" /> Підтверджую, що я батьки дитини</>
              ) : 'Увійти'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { child, shift, supervisors } = info;
  return (
    <div className="min-h-[100dvh] w-full px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
      <div className="max-w-lg mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Кабінет батьків</span>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white h-9 px-3 rounded-full border border-white/10">
            <LogOut className="w-3.5 h-3.5" /> Вийти
          </button>
        </header>

        <section className="rounded-3xl bg-white/[0.04] border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FA5A15]/15 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-[#FA5A15]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black text-white truncate">{child.full_name}</h1>
              <p className="text-xs text-slate-400">Команда {child.team_number}{child.team_name ? ` · ${child.team_name}` : ''}</p>
            </div>
          </div>
          {shift && (
            <p className="mt-3 pt-3 border-t border-white/10 text-xs text-slate-300 flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              {shift.name}: {fmt(shift.start_date)} – {fmt(shift.end_date)}
            </p>
          )}
          <p className="mt-3 pt-3 border-t border-white/10 text-xs text-slate-300">
            <span className="text-slate-500">Супровід: </span>
            {supervisors.length ? supervisors.map((s) => s.full_name).join(', ') : 'ще не призначено'}
          </p>
        </section>

        <section className="rounded-3xl bg-white/[0.04] border border-white/10 overflow-hidden">
          <button onClick={() => setScheduleOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 h-12 text-sm font-bold text-white active:bg-white/[0.03] transition">
            <span className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-slate-400" /> Розклад команди</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${scheduleOpen ? 'rotate-180' : ''}`} />
          </button>
          {scheduleOpen && (
            <div className="px-2 pb-3">
               <Suspense fallback={<p className="px-3 py-4 text-sm text-slate-400">Завантажуємо розклад...</p>}><ScheduleView myTeam={child.team_number} lockTeam /></Suspense>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ParentFlow;
