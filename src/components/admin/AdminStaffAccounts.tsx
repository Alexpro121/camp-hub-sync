import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, Trash2, UserCog, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

interface Member { user_id: string; full_name: string; login: string; is_active: boolean }
interface Asg { id: string; staff_user_id: string; shift_id: string; team_number: number }
interface ShiftLite { id: string; name: string; start_date: string }

const ERR: Record<string, string> = {
  login_taken: 'Такий логін уже існує',
  invalid_input: 'Логін: латиниця/цифри (3–40), пароль від 6 символів',
};

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('staff-accounts', { body }).catch((e) => ({ data: null as any, error: e }));
  if (error || data?.error) throw new Error(data?.error || 'failed');
  return data;
}

const genPass = () => Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 6);

const AdminStaffAccounts = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [asg, setAsg] = useState<Asg[]>([]);
  const [shifts, setShifts] = useState<ShiftLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ full_name: '', login: '', password: genPass() });
  const [pick, setPick] = useState<Record<string, { shift: string; team: string }>>({});

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        call({ action: 'list' }),
        supabase.from('shifts').select('id, name, start_date').is('deleted_at', null).order('start_date', { ascending: false }),
      ]);
      setMembers(d.members); setAsg(d.assignments); setShifts((s.data ?? []) as ShiftLite[]);
    } catch { toast.error('Не вдалося завантажити акаунти супроводу'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    try { await call(body); toast.success(ok); await load(); }
    catch (e: any) { toast.error(ERR[e?.message] ?? 'Помилка'); }
  };

  const link = `${window.location.origin}/staff`;

  return (
    <Card className="p-4 space-y-4 rounded-2xl bg-[#0F1523]/85 border-white/10">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-white inline-flex items-center gap-2"><UserCog className="w-4 h-4 text-[#FA5A15]" /> Акаунти супроводу</h3>
        <Button size="sm" variant="outline" className="rounded-xl border-white/10 bg-white/5 text-slate-200"
          onClick={() => { navigator.clipboard.writeText(link); toast.success('Посилання скопійовано'); }}>
          <Copy className="w-3.5 h-3.5 mr-1" /> Посилання для входу
        </Button>
      </div>
      <p className="text-[11px] text-slate-500 break-all">{link}</p>

      <div className="grid gap-2">
        <Input placeholder="ПІБ" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="bg-white/5 border-white/10 text-white" />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="логін (латиницею)" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} className="bg-white/5 border-white/10 text-white" />
          <Input placeholder="пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-white/5 border-white/10 text-white font-mono" />
        </div>
        <Button className="bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl" onClick={async () => {
          await run({ action: 'create', ...form }, `Створено. Логін: ${form.login.trim().toLowerCase()}, пароль: ${form.password}`);
          setForm({ full_name: '', login: '', password: genPass() });
        }}><Plus className="w-4 h-4 mr-1" /> Створити акаунт</Button>
      </div>

      {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /> : members.map((m) => {
        const p = pick[m.user_id] ?? { shift: shifts[0]?.id ?? '', team: '' };
        return (
          <div key={m.user_id} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-semibold truncate ${m.is_active ? 'text-white' : 'text-slate-500 line-through'}`}>{m.full_name}</p>
                <p className="text-xs text-slate-400">@{m.login}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" title="Новий пароль" onClick={() => {
                  const np = window.prompt('Новий пароль (від 6 символів)', genPass());
                  if (np) run({ action: 'set_password', user_id: m.user_id, password: np }, `Новий пароль: ${np}`);
                }}><KeyRound className="w-4 h-4 text-slate-300" /></Button>
                <Button size="sm" variant="ghost" className="text-xs text-slate-300" onClick={() => run({ action: 'set_active', user_id: m.user_id, is_active: !m.is_active }, m.is_active ? 'Вимкнено' : 'Увімкнено')}>
                  {m.is_active ? 'Вимкнути' : 'Увімкнути'}
                </Button>
                <Button size="icon" variant="ghost" title="Видалити" onClick={() => {
                  if (window.confirm(`Видалити акаунт ${m.full_name}?`)) run({ action: 'delete', user_id: m.user_id }, 'Видалено');
                }}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {asg.filter((a) => a.staff_user_id === m.user_id).map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-[#FA5A15]/10 border border-[#FA5A15]/25 text-[#FA5A15]">
                  {shifts.find((s) => s.id === a.shift_id)?.name ?? 'Зміна'} · №{a.team_number}
                  <button aria-label="Зняти" onClick={() => run({ action: 'unassign', assignment_id: a.id }, 'Знято з зміни')}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <select value={p.shift} onChange={(e) => setPick({ ...pick, [m.user_id]: { ...p, shift: e.target.value } })}
                className="flex-1 min-w-0 h-9 rounded-lg bg-white/5 border border-white/10 text-white text-xs px-2">
                {shifts.map((s) => <option key={s.id} value={s.id} className="bg-[#0F1523]">{s.name}</option>)}
              </select>
              <Input inputMode="numeric" placeholder="№" value={p.team} onChange={(e) => setPick({ ...pick, [m.user_id]: { ...p, team: e.target.value } })}
                className="w-16 h-9 bg-white/5 border-white/10 text-white text-xs" />
              <Button size="sm" className="h-9 bg-white/10 hover:bg-white/15 text-white" onClick={() =>
                run({ action: 'assign', user_id: m.user_id, shift_id: p.shift, team_number: Number(p.team) }, 'Призначено')}>
                Призначити
              </Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
};

export default AdminStaffAccounts;
