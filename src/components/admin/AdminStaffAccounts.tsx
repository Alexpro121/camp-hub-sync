import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Link2, Loader2, Plus, Search, Trash2, UserCog, X, Phone, Send, Ban, ChevronDown, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import StaffAvatar from '@/components/staff/StaffAvatar';
import { KIND_LABEL, StaffKind, staffCall, staffErr } from '@/lib/staffApi';
import { cn } from '@/lib/utils';

interface Member { user_id: string; full_name: string; login: string; is_active: boolean; kind: StaffKind; phone: string | null; telegram: string | null; avatar_url: string | null }
interface Asg { id: string; staff_user_id: string; shift_id: string; team_number: number }
interface ShiftLite { id: string; name: string; start_date: string }
interface Invite { id: string; token: string; label: string | null; kind: StaffKind; max_uses: number | null; uses: number; expires_at: string | null; revoked: boolean; created_at: string }

type Filter = 'all' | StaffKind | 'off';

const genPass = () => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(10));
  const s = Array.from(r, (b) => a[b % a.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
};
const inviteUrl = (t: string) => `${window.location.origin}/staff/join/${t}`;
const inviteAlive = (i: Invite) => !i.revoked && (!i.expires_at || new Date(i.expires_at) > new Date()) && (i.max_uses == null || i.uses < i.max_uses);
const fmtDT = (d: string) => new Date(d).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const KindToggle = ({ value, onChange }: { value: StaffKind; onChange: (k: StaffKind) => void }) => (
  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted">
    {(['supervisor', 'duckling'] as StaffKind[]).map((k) => (
      <button key={k} type="button" onClick={() => onChange(k)}
        className={cn('h-9 rounded-lg text-sm font-semibold transition-all active:scale-[0.98]',
          value === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
        {KIND_LABEL[k]}
      </button>
    ))}
  </div>
);

const KindBadge = ({ kind }: { kind: StaffKind }) => (
  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
    kind === 'duckling' ? 'bg-warning/15 text-warning border-warning/30' : 'bg-primary/10 text-primary border-primary/25')}>
    {KIND_LABEL[kind]}
  </span>
);

const AdminStaffAccounts = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [asg, setAsg] = useState<Asg[]>([]);
  const [shifts, setShifts] = useState<ShiftLite[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Member | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s, inv] = await Promise.all([
        staffCall({ action: 'list' }),
        supabase.from('shifts').select('id, name, start_date').is('deleted_at', null).order('start_date', { ascending: false }),
        staffCall({ action: 'invite_list' }),
      ]);
      setMembers(d.members); setAsg(d.assignments); setShifts((s.data ?? []) as ShiftLite[]); setInvites(inv.invites);
    } catch { toast.error('Не вдалося завантажити команду супроводу'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (editing) setEditing(members.find((m) => m.user_id === editing.user_id) ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    try { await staffCall(body); toast.success(ok); await load(); return true; }
    catch (e) { toast.error(staffErr(e)); return false; }
  };

  const counts = useMemo(() => ({
    all: members.length,
    supervisor: members.filter((m) => m.kind === 'supervisor').length,
    duckling: members.filter((m) => m.kind === 'duckling').length,
    off: members.filter((m) => !m.is_active).length,
  }), [members]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return members.filter((m) =>
      (filter === 'all' || (filter === 'off' ? !m.is_active : m.kind === filter)) &&
      (!s || m.full_name.toLowerCase().includes(s) || m.login.includes(s) || (m.phone ?? '').includes(s) || (m.telegram ?? '').toLowerCase().includes(s)),
    );
  }, [members, q, filter]);

  const shiftName = (id: string) => shifts.find((s) => s.id === id)?.name ?? 'Зміна';
  const aliveInvites = invites.filter(inviteAlive);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground inline-flex items-center gap-2"><UserCog className="w-4 h-4 text-primary" /> Супровід і каченята</h3>
          <p className="text-xs text-muted-foreground">{counts.supervisor} супровід, {counts.duckling} каченят</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => setInviteOpen(true)}>
            <Link2 className="w-4 h-4 mr-1" /> Посилання
          </Button>
          <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> Додати
          </Button>
        </div>
      </header>

      {aliveInvites.length > 0 && (
        <button onClick={() => setInviteOpen(true)} className="w-full text-left rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground active:scale-[0.99] transition-transform">
          Активних посилань на реєстрацію: <b>{aliveInvites.length}</b>. Зареєструвалось: <b>{aliveInvites.reduce((s, i) => s + i.uses, 0)}</b>
        </button>
      )}

      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук: імʼя, логін, телефон" className="pl-9 h-10 rounded-xl" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {([['all', 'Всі'], ['supervisor', 'Супровід'], ['duckling', 'Каченята'], ['off', 'Вимкнені']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cn('shrink-0 h-8 px-3 rounded-full text-xs font-semibold border transition-colors',
                filter === k ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-muted-foreground border-border hover:text-foreground')}>
              {l} <span className="opacity-60">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">{members.length ? 'Нікого не знайдено' : 'Ще немає жодного акаунта'}</p>
          {!members.length && <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>Створити посилання на реєстрацію</Button>}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((m) => {
            const mine = asg.filter((a) => a.staff_user_id === m.user_id);
            return (
              <li key={m.user_id}>
                <button onClick={() => setEditing(m)}
                  className={cn('w-full flex items-center gap-3 rounded-xl p-2.5 text-left hover:bg-muted/60 active:scale-[0.99] transition-all', !m.is_active && 'opacity-50')}>
                  <StaffAvatar name={m.full_name} src={m.avatar_url} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm text-foreground truncate">{m.full_name}</p>
                      <KindBadge kind={m.kind} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      @{m.login}{mine.length ? `, команда ${[...new Set(mine.map((a) => a.team_number))].join(', ')}` : ', без команди'}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-border pt-3">
        <button onClick={() => setLegacyOpen((v) => !v)} className="w-full flex items-center justify-between text-xs text-muted-foreground">
          Перенесення старих командних входів <ChevronDown className={cn('w-4 h-4 transition-transform', legacyOpen && 'rotate-180')} />
        </button>
        {legacyOpen && <LegacyMigrate onDone={load} />}
      </div>

      <CreateSheet open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} invites={invites} onChanged={load} />
      <MemberSheet member={editing} onClose={() => setEditing(null)} asg={asg.filter((a) => a.staff_user_id === editing?.user_id)}
        shifts={shifts} shiftName={shiftName} run={run} />
    </section>
  );
};

/* ---------------- Створення вручну ---------------- */
const CreateSheet = ({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) => {
  const empty = () => ({ full_name: '', login: '', password: genPass(), phone: '', telegram: '', kind: 'supervisor' as StaffKind });
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await staffCall({ action: 'create', ...f });
      navigator.clipboard?.writeText(`Логін: ${f.login.trim().toLowerCase()}\nПароль: ${f.password}\n${window.location.origin}/staff`).catch(() => {});
      toast.success('Акаунт створено, дані для входу скопійовано');
      setF(empty()); onSaved(); onClose();
    } catch (e) { toast.error(staffErr(e)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto">
        <SheetHeader><SheetTitle>Новий акаунт</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 max-w-md mx-auto">
          <KindToggle value={f.kind} onChange={(kind) => setF({ ...f, kind })} />
          <Field label="ПІБ"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Телефон"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+380" /></Field>
            <Field label="Telegram"><Input value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@нік" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Логін"><Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} placeholder="olena.k" autoCapitalize="none" /></Field>
            <Field label="Пароль"><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="font-mono" /></Field>
          </div>
          <Button className="w-full h-11 rounded-xl" disabled={busy || !f.full_name || !f.login} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Створити'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ---------------- Посилання на реєстрацію ---------------- */
const InviteSheet = ({ open, onClose, invites, onChanged }: { open: boolean; onClose: () => void; invites: Invite[]; onChanged: () => void }) => {
  const [kind, setKind] = useState<StaffKind>('supervisor');
  const [label, setLabel] = useState('');
  const [useCount, setUseCount] = useState(true);
  const [useTime, setUseTime] = useState(false);
  const [count, setCount] = useState('10');
  const [hours, setHours] = useState('24');
  const [busy, setBusy] = useState(false);

  const copy = (t: string) => { navigator.clipboard.writeText(inviteUrl(t)); toast.success('Посилання скопійовано'); };
  const create = async () => {
    if (!useCount && !useTime) { toast.error('Оберіть обмеження: кількість або час'); return; }
    setBusy(true);
    try {
      const { invite } = await staffCall<{ invite: Invite }>({ action: 'invite_create', kind, label, max_uses: useCount ? count : null, hours: useTime ? hours : null });
      copy(invite.token);
      setLabel(''); onChanged();
    } catch (e) { toast.error(staffErr(e)); }
    setBusy(false);
  };
  const alive = invites.filter(inviteAlive);
  const dead = invites.filter((i) => !inviteAlive(i)).slice(0, 5);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto">
        <SheetHeader><SheetTitle>Посилання на реєстрацію</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-5 max-w-md mx-auto">
          <div className="space-y-3 rounded-2xl border border-border p-3">
            <KindToggle value={kind} onChange={setKind} />
            <Field label="Назва (для себе, необовʼязково)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Каченята, серпень" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <LimitBox on={useCount} onToggle={() => setUseCount((v) => !v)} title="Кількість">
                <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} className="h-9" disabled={!useCount} />
                <span className="text-[11px] text-muted-foreground">реєстрацій</span>
              </LimitBox>
              <LimitBox on={useTime} onToggle={() => setUseTime((v) => !v)} title="Термін дії">
                <select value={hours} onChange={(e) => setHours(e.target.value)} disabled={!useTime}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="1">1 година</option><option value="6">6 годин</option><option value="24">1 день</option>
                  <option value="72">3 дні</option><option value="168">7 днів</option><option value="720">30 днів</option>
                </select>
              </LimitBox>
            </div>
            <Button className="w-full h-11 rounded-xl" disabled={busy} onClick={create}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Link2 className="w-4 h-4 mr-1.5" /> Створити й скопіювати</>}
            </Button>
          </div>

          {alive.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Активні</p>
              {alive.map((i) => <InviteRow key={i.id} i={i} onCopy={() => copy(i.token)} onRevoke={async () => {
                try { await staffCall({ action: 'invite_revoke', id: i.id }); toast.success('Посилання вимкнено'); onChanged(); } catch (e) { toast.error(staffErr(e)); }
              }} />)}
            </div>
          )}
          {dead.length > 0 && (
            <div className="space-y-2 opacity-60">
              <p className="text-sm font-semibold text-foreground">Завершені</p>
              {dead.map((i) => <InviteRow key={i.id} i={i} />)}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const LimitBox = ({ on, onToggle, title, children }: { on: boolean; onToggle: () => void; title: string; children: React.ReactNode }) => (
  <div className={cn('rounded-xl border p-2.5 space-y-1.5 transition-colors', on ? 'border-primary/50 bg-primary/5' : 'border-border')}>
    <button type="button" onClick={onToggle} className="w-full flex items-center justify-between text-xs font-semibold text-foreground">
      {title}
      <span className={cn('w-8 h-5 rounded-full p-0.5 transition-colors', on ? 'bg-primary' : 'bg-muted')}>
        <span className={cn('block w-4 h-4 rounded-full bg-background transition-transform', on && 'translate-x-3')} />
      </span>
    </button>
    {children}
  </div>
);

const InviteRow = ({ i, onCopy, onRevoke }: { i: Invite; onCopy?: () => void; onRevoke?: () => void }) => (
  <div className="flex items-center gap-2 rounded-xl border border-border p-2.5">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5"><KindBadge kind={i.kind} /><p className="text-sm font-medium text-foreground truncate">{i.label || 'Без назви'}</p></div>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {i.uses}{i.max_uses != null ? ` з ${i.max_uses}` : ''} зареєстр.
        {i.expires_at ? `, до ${fmtDT(i.expires_at)}` : ''}{i.revoked ? ', вимкнено' : ''}
      </p>
    </div>
    {onCopy && <Button size="icon" variant="ghost" onClick={onCopy} aria-label="Копіювати"><Copy className="w-4 h-4" /></Button>}
    {onRevoke && <Button size="icon" variant="ghost" onClick={onRevoke} aria-label="Вимкнути"><Ban className="w-4 h-4 text-destructive" /></Button>}
  </div>
);

/* ---------------- Картка людини ---------------- */
const MemberSheet = ({ member, onClose, asg, shifts, shiftName, run }: {
  member: Member | null; onClose: () => void; asg: Asg[]; shifts: ShiftLite[]; shiftName: (id: string) => string;
  run: (b: Record<string, unknown>, ok: string) => Promise<boolean>;
}) => {
  const [f, setF] = useState({ full_name: '', phone: '', telegram: '', kind: 'supervisor' as StaffKind });
  const [pick, setPick] = useState({ shift: '', team: '' });
  const [newPass, setNewPass] = useState<string | null>(null);
  useEffect(() => {
    if (member) {
      setF({ full_name: member.full_name, phone: member.phone ?? '', telegram: member.telegram ?? '', kind: member.kind });
      setPick({ shift: shifts[0]?.id ?? '', team: '' }); setNewPass(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.user_id]);
  if (!member) return null;
  const dirty = f.full_name !== member.full_name || f.phone !== (member.phone ?? '') || f.telegram !== (member.telegram ?? '') || f.kind !== member.kind;

  return (
    <Sheet open={!!member} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92dvh] overflow-y-auto">
        <div className="max-w-md mx-auto space-y-5 pt-2">
          <div className="flex items-center gap-3">
            <StaffAvatar name={member.full_name} src={member.avatar_url} size={64} />
            <div className="min-w-0">
              <SheetTitle className="truncate text-left">{member.full_name}</SheetTitle>
              <p className="text-xs text-muted-foreground">@{member.login}{member.is_active ? '' : ', вимкнено'}</p>
              <div className="flex gap-3 mt-1">
                {member.phone && <a href={`tel:${member.phone}`} className="text-xs text-primary inline-flex items-center gap-1"><Phone className="w-3 h-3" />{member.phone}</a>}
                {member.telegram && <a href={`https://t.me/${member.telegram}`} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1"><Send className="w-3 h-3" />@{member.telegram}</a>}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <KindToggle value={f.kind} onChange={(kind) => setF({ ...f, kind })} />
            <Field label="ПІБ"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Телефон"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Telegram"><Input value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} /></Field>
            </div>
            {dirty && <Button className="w-full rounded-xl" onClick={() => run({ action: 'update_member', user_id: member.user_id, ...f }, 'Збережено')}>Зберегти зміни</Button>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Зміни та команди</p>
            <div className="flex flex-wrap gap-1.5">
              {asg.length === 0 && <p className="text-xs text-muted-foreground">Ще не призначено</p>}
              {asg.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary">
                  {shiftName(a.shift_id)}, №{a.team_number}
                  <button aria-label="Зняти" onClick={() => run({ action: 'unassign', assignment_id: a.id }, 'Знято')}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <select value={pick.shift} onChange={(e) => setPick({ ...pick, shift: e.target.value })}
                className="flex-1 min-w-0 h-10 rounded-md border border-input bg-background text-foreground text-sm px-2">
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Input inputMode="numeric" placeholder="№" value={pick.team} onChange={(e) => setPick({ ...pick, team: e.target.value.replace(/\D/g, '') })} className="w-16 h-10" />
              <Button className="h-10" disabled={!pick.shift || !pick.team}
                onClick={async () => { if (await run({ action: 'assign', user_id: member.user_id, shift_id: pick.shift, team_number: Number(pick.team) }, 'Призначено')) setPick({ ...pick, team: '' }); }}>
                Додати
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {newPass && (
              <button onClick={() => { navigator.clipboard.writeText(newPass); toast.success('Скопійовано'); }}
                className="w-full rounded-xl border border-primary/30 bg-primary/5 p-3 text-left">
                <p className="text-xs text-muted-foreground">Новий пароль (натисніть, щоб скопіювати)</p>
                <p className="font-mono font-bold text-foreground">{newPass}</p>
              </button>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" className="rounded-xl text-xs" onClick={async () => {
                const p = genPass(); if (await run({ action: 'set_password', user_id: member.user_id, password: p }, 'Пароль змінено')) setNewPass(p);
              }}><KeyRound className="w-4 h-4 mr-1" /> Пароль</Button>
              <Button variant="secondary" className="rounded-xl text-xs" onClick={() => run({ action: 'set_active', user_id: member.user_id, is_active: !member.is_active }, member.is_active ? 'Вимкнено' : 'Увімкнено')}>
                <Power className="w-4 h-4 mr-1" /> {member.is_active ? 'Вимкнути' : 'Увімкнути'}
              </Button>
              <Button variant="secondary" className="rounded-xl text-xs text-destructive" onClick={async () => {
                if (window.confirm(`Видалити акаунт ${member.full_name}? Це не можна скасувати.`)) {
                  if (await run({ action: 'delete', user_id: member.user_id }, 'Видалено')) onClose();
                }
              }}><Trash2 className="w-4 h-4 mr-1" /> Видалити</Button>
            </div>
            {member.avatar_url && (
              <button className="text-xs text-muted-foreground underline" onClick={() => run({ action: 'update_member', user_id: member.user_id, avatar_url: null }, 'Фото прибрано')}>Прибрати фото</button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>
);

/* ---------------- Старі входи ---------------- */
const LegacyMigrate = ({ onDone }: { onDone: () => void }) => {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Array<{ team: number; login: string; password: string; status: string }>>([]);
  const link = `${window.location.origin}/staff`;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground">Старі входи за номером команди стануть акаунтами team1, team2... з тими самими паролями.</p>
      <Button size="sm" variant="secondary" disabled={busy} className="w-full rounded-xl" onClick={async () => {
        setBusy(true);
        try { const d = await staffCall({ action: 'migrate_legacy' }); setReport(d.report ?? []); toast.success('Перенесено'); onDone(); }
        catch { toast.error('Не вдалося перенести'); }
        setBusy(false);
      }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Перенести'}</Button>
      {report.length > 0 && (
        <>
          {report.map((r) => (
            <div key={r.team} className="flex justify-between text-[11px] font-mono text-foreground">
              <span>№{r.team} {r.login}</span><span className={r.status === 'failed' ? 'text-destructive' : ''}>{r.status === 'failed' ? 'помилка' : r.password}</span>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => {
            navigator.clipboard.writeText(report.filter((r) => r.status !== 'failed').map((r) => `Команда ${r.team}: логін ${r.login}, пароль ${r.password}, ${link}`).join('\n'));
            toast.success('Скопійовано');
          }}><Copy className="w-3.5 h-3.5 mr-1" /> Скопіювати всі</Button>
        </>
      )}
    </div>
  );
};

export default AdminStaffAccounts;
