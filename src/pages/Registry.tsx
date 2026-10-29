import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, LogOut, Phone, Search, StickyNote, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buildIndex, normalize, searchItems, type Indexed } from '@/lib/registrySearch';
import { toast } from 'sonner';

interface Kid {
  id: string; shift_id: string; full_name: string; team_number: number; phone: string | null;
  note_from_table: string | null; supervisor_notes: string | null; is_present: boolean;
  gender: string | null; telegram_username: string | null;
}
const TOKEN_KEY = 'ironshift:registry-token';

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('registry', { body });
  if (error) throw new Error('network');
  if (data?.error) throw new Error(data.error);
  return data;
}

function Gate({ onToken }: { onToken: (t: string) => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setErr('');
    try { const d = await call({ action: 'login', password: pw }); onToken(d.token); }
    catch (x: any) {
      setErr(x.message === 'too_many_attempts' ? 'Забагато спроб. Зачекайте хвилину.' : x.message === 'invalid_password' ? 'Невірний пароль' : 'Немає зв\'язку. Спробуйте ще раз.');
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--gradient-primary)' }}>
            <Check className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Реєстрація дітей</h1>
          <p className="text-sm text-muted-foreground">Введіть пароль стійки</p>
        </div>
        <div className="relative">
          <input autoFocus type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="Пароль" aria-label="Пароль"
            className="h-12 w-full rounded-xl border border-input bg-background px-4 pr-12 text-foreground outline-none focus:ring-2 focus:ring-ring" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Сховати пароль' : 'Показати пароль'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-destructive animate-in fade-in slide-in-from-top-1">{err}</p>}
        <button disabled={busy || !pw} className="mt-4 h-12 w-full rounded-xl font-semibold text-primary-foreground disabled:opacity-50 transition-transform active:scale-[0.98]" style={{ background: 'var(--gradient-primary)' }}>
          {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Увійти'}
        </button>
      </form>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const words = normalize(query).split(' ').filter((w) => w.length >= 2);
  if (!words.length) return <>{text}</>;
  return <>{text.split(/(\s+)/).map((part, i) => {
    const n = normalize(part);
    const hit = words.some((w) => n.startsWith(w));
    return hit ? <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">{part}</mark> : <span key={i}>{part}</span>;
  })}</>;
}

const Row = memo(function Row({ kid, query, shiftName, onToggle, onOpen, i }: {
  kid: Kid; query: string; shiftName?: string; i: number; onToggle: (k: Kid) => void; onOpen: (k: Kid) => void;
}) {
  return (
    <li className="animate-in fade-in slide-in-from-bottom-2 duration-200 fill-mode-both" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
      <div className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${kid.is_present ? 'border-success/50 bg-success/10' : 'border-border bg-card'}`}>
        <button onClick={() => onToggle(kid)} aria-label={kid.is_present ? 'Зняти присутність' : 'Позначити присутнім'}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 transition-all duration-200 active:scale-90 ${kid.is_present ? 'border-success bg-success text-success-foreground' : 'border-muted-foreground/40 text-transparent'}`}>
          <Check className={`h-6 w-6 transition-transform ${kid.is_present ? 'scale-100' : 'scale-50'}`} />
        </button>
        <button onClick={() => onOpen(kid)} className="min-w-0 flex-1 text-left">
          <div className="truncate font-semibold text-foreground"><Highlight text={kid.full_name} query={query} /></div>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>Команда {kid.team_number}</span>
            {shiftName && <span className="truncate">· {shiftName}</span>}
            {kid.supervisor_notes && <span className="inline-flex items-center gap-0.5 text-warning"><StickyNote className="h-3 w-3" />нотатка</span>}
          </div>
        </button>
      </div>
    </li>
  );
});

function Profile({ kid, shiftName, onClose, onToggle, onSaveNote }: {
  kid: Kid; shiftName?: string; onClose: () => void; onToggle: (k: Kid) => void; onSaveNote: (k: Kid, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(kid.supervisor_notes ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = note !== (kid.supervisor_notes ?? '');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const save = async () => { setSaving(true); try { await onSaveNote(kid, note); } finally { setSaving(false); } };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-8 duration-300 sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-bold text-foreground">{kid.full_name}</h2>
            <p className="text-sm text-muted-foreground">Команда {kid.team_number}{shiftName ? ` · ${shiftName}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Закрити" className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
          <button onClick={() => onToggle(kid)}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-all active:scale-[0.98] ${kid.is_present ? 'bg-success text-success-foreground' : 'border-2 border-dashed border-border text-foreground'}`}>
            <Check className="h-5 w-5" />{kid.is_present ? 'Присутній(я) — зареєстровано' : 'Позначити присутнім'}
          </button>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            {kid.phone && <><dt className="text-muted-foreground">Телефон</dt><dd><a href={`tel:${kid.phone}`} className="inline-flex items-center gap-1 text-primary"><Phone className="h-3.5 w-3.5" />{kid.phone}</a></dd></>}
            {kid.telegram_username && <><dt className="text-muted-foreground">Telegram</dt><dd className="break-all text-foreground">@{kid.telegram_username.replace(/^@/, '')}</dd></>}
            {kid.gender && <><dt className="text-muted-foreground">Стать</dt><dd className="text-foreground">{kid.gender === 'female' ? 'дівчинка' : kid.gender === 'male' ? 'хлопчик' : '—'}</dd></>}
            {kid.note_from_table && <><dt className="text-muted-foreground">Зі списку</dt><dd className="break-words text-foreground">{kid.note_from_table}</dd></>}
          </dl>
          <div>
            <label htmlFor="reg-note" className="mb-1 block text-sm font-medium text-foreground">Нотатки</label>
            <textarea id="reg-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000}
              placeholder="Напр.: здали ліки, алергія, приїхав пізніше…"
              className="w-full resize-none rounded-xl border border-input bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={dirty ? save : onClose} disabled={saving}
            className="h-12 w-full rounded-xl font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60" style={{ background: 'var(--gradient-primary)' }}>
            {saving ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : dirty ? 'Зберегти нотатку' : 'Готово'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Desk({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [shifts, setShifts] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDeferredValue(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexCache = useRef(new Map<string, Indexed>());

  const load = useCallback(async () => {
    try {
      const d = await call({ action: 'list', token });
      setShifts(Object.fromEntries((d.shifts ?? []).map((s: any) => [s.id, s.name])));
      setKids(d.children ?? []);
    } catch (e: any) {
      if (e.message === 'unauthorized') onLogout();
      else if (!kids) toast.error('Не вдалося завантажити список');
    }
  }, [token, onLogout, kids]);

  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    loadRef.current();
    const t = setInterval(() => document.visibilityState === 'visible' && loadRef.current(), 30_000);
    return () => clearInterval(t);
  }, []);

  const indexOf = useCallback((k: Kid) => {
    const key = `${k.id}|${k.full_name}`;
    let v = indexCache.current.get(key);
    if (!v) { v = buildIndex(k.full_name, k.phone); indexCache.current.set(key, v); }
    return v;
  }, []);

  const results = useMemo(() => (kids ? searchItems(kids, indexOf, dq, 40) : []), [kids, dq, indexOf]);
  const present = useMemo(() => kids?.filter((k) => k.is_present).length ?? 0, [kids]);

  const patch = (id: string, p: Partial<Kid>) => setKids((ks) => ks?.map((k) => (k.id === id ? { ...k, ...p } : k)) ?? ks);

  const toggle = useCallback(async (k: Kid) => {
    const next = !k.is_present;
    patch(k.id, { is_present: next });
    if (navigator.vibrate) navigator.vibrate(15);
    try { await call({ action: 'update', token, id: k.id, is_present: next }); if (next) toast.success(`${k.full_name.split(' ').slice(0, 2).join(' ')} — зареєстровано`, { duration: 1500 }); }
    catch { patch(k.id, { is_present: !next }); toast.error('Не збереглося, спробуйте ще раз'); }
  }, [token]);

  const saveNote = useCallback(async (k: Kid, note: string) => {
    try { await call({ action: 'update', token, id: k.id, supervisor_notes: note }); patch(k.id, { supervisor_notes: note }); toast.success('Нотатку збережено'); setOpenId(null); }
    catch { toast.error('Не збереглося, спробуйте ще раз'); }
  }, [token]);

  const openKid = kids?.find((k) => k.id === openId) ?? null;
  const total = kids?.length ?? 0;

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex items-center gap-2">
            <h1 className="flex-1 text-lg font-bold text-foreground">Реєстрація</h1>
            <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-semibold tabular-nums text-success">{present} / {total}</span>
            <button onClick={onLogout} aria-label="Вийти" className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><LogOut className="h-5 w-5" /></button>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-success transition-[width] duration-500" style={{ width: total ? `${(present / total) * 100}%` : 0 }} />
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
              onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) setOpenId(results[0].id); }}
              placeholder="Прізвище, ім'я або телефон…" aria-label="Пошук дитини" autoComplete="off" autoCorrect="off" spellCheck={false}
              className="h-14 w-full rounded-2xl border border-input bg-card pl-11 pr-11 text-base text-foreground outline-none focus:ring-2 focus:ring-ring" />
            {q && <button onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Очистити" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground"><X className="h-5 w-5" /></button>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4">
        {!kids ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[70px] animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : !dq.trim() ? (
          <p className="pt-10 text-center text-muted-foreground">Почніть вводити ім'я — порядок слів, розкладка і одруківки не важливі.</p>
        ) : results.length === 0 ? (
          <p className="pt-10 text-center text-muted-foreground">Нікого не знайдено за «{dq}»</p>
        ) : (
          <ul key={dq} className={`space-y-2 transition-opacity ${q !== dq ? 'opacity-60' : ''}`}>
            {results.map((k, i) => <Row key={k.id} i={i} kid={k} query={dq} shiftName={Object.keys(shifts).length > 1 ? shifts[k.shift_id] : undefined} onToggle={toggle} onOpen={(x) => setOpenId(x.id)} />)}
          </ul>
        )}
      </main>
      {openKid && <Profile key={openKid.id} kid={openKid} shiftName={shifts[openKid.shift_id]} onClose={() => { setOpenId(null); inputRef.current?.select(); }} onToggle={toggle} onSaveNote={saveNote} />}
    </div>
  );
}

export default function Registry() {
  const [token, setToken] = useState<string | null>(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && Number(t.split('.')[0]) > Date.now() ? t : null;
  });
  useEffect(() => { document.title = 'Реєстрація дітей'; }, []);
  const onToken = (t: string) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); };
  const logout = useCallback(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }, []);
  return token ? <Desk token={token} onLogout={logout} /> : <Gate onToken={onToken} />;
}
