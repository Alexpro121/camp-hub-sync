import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, Phone, User, Users, CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { saveSession, getSavedRole, getSessionMeta, updateSessionMeta, clearSavedSession } from '@/lib/session';
import ScheduleView from '@/components/schedule/ScheduleView';

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('parent-login', { body: { fullName, phone } });
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
    return (
      <div className="min-h-[100dvh] w-full flex flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8">
        <button onClick={onBack} className="self-start flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors h-10">
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>
        <div className="w-full max-w-sm mx-auto my-auto">
          <h1 className="text-2xl font-black text-white tracking-tight">Вхід для батьків</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">Введіть ПІБ дитини та номер телефону, вказаний у заявці.</p>
          <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300">ПІБ дитини</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" maxLength={120}
                placeholder="Коваль Марʼяна Олегівна"
                className="h-12 rounded-2xl bg-white/[0.04] border border-white/10 px-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FA5A15]" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300">Номер телефону</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20}
                placeholder="+380 67 123 45 67"
                className="h-12 rounded-2xl bg-white/[0.04] border border-white/10 px-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FA5A15]" />
            </label>
            {error && <p className="text-sm text-red-400 leading-snug">{error}</p>}
            <button type="submit" disabled={loading || !fullName.trim() || !phone.trim()}
              className="h-12 mt-1 rounded-2xl bg-[#FA5A15] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Увійти'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { child, shift, supervisors } = info;
  return (
    <div className="min-h-[100dvh] w-full px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <div className="max-w-lg mx-auto flex flex-col gap-5">
        <header className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Кабінет батьків</span>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white h-9 px-3 rounded-full border border-white/10">
            <LogOut className="w-3.5 h-3.5" /> Вийти
          </button>
        </header>

        <section className="rounded-3xl bg-white/[0.04] border border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FA5A15]/15 flex items-center justify-center">
              <User className="w-5 h-5 text-[#FA5A15]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-white truncate">{child.full_name}</h1>
              <p className="text-sm text-slate-400">Команда {child.team_number}{child.team_name ? `, ${child.team_name}` : ''}</p>
            </div>
          </div>
          {shift && (
            <p className="mt-4 pt-4 border-t border-white/10 text-sm text-slate-300 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-500" />
              {shift.name}: {fmt(shift.start_date)} - {fmt(shift.end_date)}
            </p>
          )}
        </section>

        <section>
          <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Супровід команди</h2>
          {supervisors.length ? (
            <ul className="flex flex-col gap-2">
              {supervisors.map((s) => (
                <li key={s.full_name} className="rounded-2xl bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-slate-200">{s.full_name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 flex items-center gap-2"><Phone className="w-4 h-4" /> Супровід ще не призначено</p>
          )}
        </section>

        <section>
          <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-slate-400" /> Розклад</h2>
          <ScheduleView myTeam={child.team_number} lockTeam />
        </section>
      </div>
    </div>
  );
};

export default ParentFlow;
