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
    <li style={{ contentVisibility: 'auto', containIntrinsicSize: '70px', animationDelay: `${Math.min(i, 10) * 25}ms` }} className="animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-both motion-reduce:animate-none">
      <div className={`flex items-center gap-3 rounded-2xl border p-2.5 sm:p-3 transition-colors duration-300 ${kid.is_present ? 'border-success/50 bg-success/10' : 'border-border bg-card'}`}>
        <button onClick={() => onToggle(kid)} aria-label={kid.is_present ? 'Зняти присутність' : 'Позначити присутнім'}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 transition-[background-color,border-color,transform] duration-200 active:scale-90 [-webkit-tap-highlight-color:transparent] ${kid.is_present ? 'border-success bg-success text-success-foreground shadow-[0_0_0_4px_hsl(var(--success)/0.15)]' : 'border-muted-foreground/40 text-transparent'}`}>
          <Check className={`h-6 w-6 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] ${kid.is_present ? 'scale-100 rotate-0' : 'scale-50 -rotate-12'}`} />
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
  const close = () => (dirty ? save() : onClose());
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 sm:backdrop-blur-sm animate-in fade-in duration-200 sm:items-center" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-8 sm:zoom-in-95 duration-300 ease-out pb-[env(safe-area-inset-bottom)] sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-bold text-foreground">{kid.full_name}</h2>
            <p className="text-sm text-muted-foreground">Команда {kid.team_number}{shiftName ? ` · ${shiftName}` : ''}</p>
          </div>
          <button onClick={close} aria-label="Закрити" className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto overscroll-contain p-4">
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

type Filter = 'all' | 'absent' | 'present';
const QUEUE_KEY = 'ironshift:registry-queue';
type Pending = Record<string, { is_present?: boolean; supervisor_notes?: string }>;
const readQueue = (): Pending => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}'); } catch { return {}; } };
const writeQueue = (q: Pending) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

function Desk({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [shifts, setShifts] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [team, setTeam] = useState<number | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const [openId, setOpenId] = useState<string | null>(null);
  const [queued, setQueued] = useState(() => Object.keys(readQueue()).length);
  const dq = useDeferredValue(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexCache = useRef(new Map<string, Indexed>());
  const loaded = useRef(false);

  // Невідправлені дії накладаємо поверх свіжого списку з сервера.
  const applyQueue = (list: Kid[]) => {
    const pq = readQueue();
    return list.map((k) => (pq[k.id] ? { ...k, ...pq[k.id] } : k));
  };

  const flush = useCallback(async () => {
    const pq = readQueue();
    const ids = Object.keys(pq);
    for (const id of ids) {
      try {
        await call({ action: 'update', token, id, ...pq[id] });
        const cur = readQueue(); delete cur[id]; writeQueue(cur);
      } catch (e: any) {
        if (e.message === 'unauthorized') return onLogout();
        if (e.message === 'not_found') { const cur = readQueue(); delete cur[id]; writeQueue(cur); continue; }
        break;
      }
    }
    setQueued(Object.keys(readQueue()).length);
  }, [token, onLogout]);

  const load = useCallback(async () => {
    try {
      await flush();
      const d = await call({ action: 'list', token });
      setShifts(Object.fromEntries((d.shifts ?? []).map((s: any) => [s.id, s.name])));
      setKids(applyQueue(d.children ?? []));
      loaded.current = true;
    } catch (e: any) {
      if (e.message === 'unauthorized') onLogout();
      else if (!loaded.current) toast.error('Не вдалося завантажити список. Повторюю…');
    }
  }, [token, onLogout, flush]);

  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    loadRef.current();
    const tick = () => document.visibilityState === 'visible' && loadRef.current();
    const t = setInterval(tick, 20_000);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);

  // «/» або будь-яка літера фокусує пошук — зручно на ноутбуці.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openId || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === '/' || e.key.length === 1) { inputRef.current?.focus(); if (e.key === '/') e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const indexOf = useCallback((k: Kid) => {
    const key = `${k.id}|${k.full_name}|${k.phone ?? ''}`;
    let v = indexCache.current.get(key);
    if (!v) { v = buildIndex(k.full_name, k.phone); indexCache.current.set(key, v); }
    return v;
  }, []);

  const scoped = useMemo(() => (kids ?? []).filter((k) => !shiftId || k.shift_id === shiftId), [kids, shiftId]);
  const teams = useMemo(() => {
    const m = new Map<number, { total: number; present: number }>();
    for (const k of scoped) { const t = m.get(k.team_number) ?? { total: 0, present: 0 }; t.total++; if (k.is_present) t.present++; m.set(k.team_number, t); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [scoped]);
  const filtered = useMemo(() => scoped.filter((k) =>
    (team === null || k.team_number === team) && (filter === 'all' || (filter === 'present') === k.is_present)), [scoped, team, filter]);

  // Пошук іде по всіх дітях (фільтр «хто не прийшов» не ховає знайдених), браузинг — по фільтру.
  const searching = dq.trim().length > 0;
  const results = useMemo(() => {
    if (searching) return searchItems(team === null ? scoped : scoped.filter((k) => k.team_number === team), indexOf, dq, 40);
    return filtered;
  }, [searching, scoped, filtered, team, indexOf, dq]);
  useEffect(() => setLimit(60), [filter, team, shiftId, dq]);

  const present = useMemo(() => scoped.filter((k) => k.is_present).length, [scoped]);
  const total = scoped.length;

  const patch = (id: string, p: Partial<Kid>) => setKids((ks) => ks?.map((k) => (k.id === id ? { ...k, ...p } : k)) ?? ks);

  const send = useCallback(async (id: string, p: { is_present?: boolean; supervisor_notes?: string }) => {
    const pq = readQueue(); pq[id] = { ...pq[id], ...p }; writeQueue(pq); setQueued(Object.keys(pq).length);
    await flush();
    if (readQueue()[id]) toast.warning('Немає зв\'язку — збережу автоматично, щойно з\'явиться інтернет', { id: 'registry-offline' });
  }, [flush]);

  const toggle = useCallback((k: Kid, fromSearch = false) => {
    const next = !k.is_present;
    patch(k.id, { is_present: next });
    navigator.vibrate?.(next ? 20 : [10, 40, 10]);
    void send(k.id, { is_present: next });
    if (next) {
      toast.success(`${k.full_name.split(' ').slice(0, 2).join(' ')} · команда ${k.team_number}`, {
        duration: 3000,
        action: { label: 'Скасувати', onClick: () => { patch(k.id, { is_present: false }); void send(k.id, { is_present: false }); } },
      });
      // Швидкий потік: відмітив знайдену дитину — поле пошуку готове до наступної.
      if (fromSearch) { setQ(''); requestAnimationFrame(() => inputRef.current?.focus()); }
    }
  }, [send]);

  const saveNote = useCallback(async (k: Kid, note: string) => {
    patch(k.id, { supervisor_notes: note });
    await send(k.id, { supervisor_notes: note });
    toast.success('Нотатку збережено', { duration: 1500 });
    setOpenId(null);
  }, [send]);

  const searchingRef = useRef(searching); searchingRef.current = searching;
  const onRowToggle = useCallback((x: Kid) => toggle(x, searchingRef.current), [toggle]);
  const onRowOpen = useCallback((x: Kid) => setOpenId(x.id), []);
  const [coarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
  const openKid = kids?.find((k) => k.id === openId) ?? null;
  const multiShift = Object.keys(shifts).length > 1;
  const visible = results.slice(0, limit);
  const chip = (active: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,transform] duration-200 active:scale-95 snap-start ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`;

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 pb-2 sm:pb-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex items-center gap-2">
            <h1 className="flex-1 text-lg font-bold text-foreground">Реєстрація</h1>
            {queued > 0 && <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning" title="Чекають на інтернет">⏳ {queued}</span>}
            <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-semibold tabular-nums text-success">{present} / {total}</span>
            <button onClick={onLogout} aria-label="Вийти" className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><LogOut className="h-5 w-5" /></button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success transition-[width] duration-700 ease-out" style={{ width: total ? `${(present / total) * 100}%` : '0%' }} />
          </div>
          <div className="relative mt-2 sm:mt-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input ref={inputRef} autoFocus={!coarse} inputMode="search" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) { e.shiftKey ? setOpenId(results[0].id) : (!results[0].is_present ? toggle(results[0], true) : setOpenId(results[0].id)); }
                if (e.key === 'Escape') setQ('');
              }}
              placeholder="Прізвище, ім'я або телефон…" aria-label="Пошук дитини" autoComplete="off" autoCorrect="off" spellCheck={false}
              className="h-12 sm:h-14 w-full rounded-2xl border border-input bg-card pl-11 pr-11 text-base text-foreground outline-none focus:ring-2 focus:ring-ring" />
            {q && <button onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Очистити" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground"><X className="h-5 w-5" /></button>}
          </div>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 snap-x [scrollbar-width:none]">
            {([['absent', `Не прийшли · ${total - present}`], ['present', `Прийшли · ${present}`], ['all', 'Усі']] as [Filter, string][]).map(([f, l]) => (
              <button key={f} onClick={() => setFilter(f)} className={chip(filter === f)}>{l}</button>
            ))}
            <span className="mx-1 w-px shrink-0 bg-border" />
            <button onClick={() => setTeam(null)} className={chip(team === null)}>Усі команди</button>
            {teams.map(([t, s]) => (
              <button key={t} onClick={() => setTeam(team === t ? null : t)} className={chip(team === t)}>
                {t} <span className="opacity-70 tabular-nums">{s.present}/{s.total}</span>
              </button>
            ))}
          </div>
          {multiShift && (
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              <button onClick={() => setShiftId(null)} className={chip(shiftId === null)}>Усі зміни</button>
              {Object.entries(shifts).map(([id, n]) => <button key={id} onClick={() => setShiftId(id)} className={chip(shiftId === id)}>{n}</button>)}
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!kids ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[70px] animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : results.length === 0 ? (
          <div className="pt-12 text-center text-muted-foreground animate-in fade-in">
            {searching ? <>Нікого не знайдено за «{dq}».<br /><span className="text-sm">Спробуйте лише прізвище або цифри телефону.</span></>
              : filter === 'absent' ? <span className="text-success font-semibold">🎉 Усі вже зареєстровані!</span> : 'Тут поки порожньо'}
          </div>
        ) : (
          <>
            {searching && <p className="mb-2 text-xs text-muted-foreground">Найкращі збіги серед усіх дітей · Enter — відмітити першого</p>}
            <ul key={`${filter}|${team}|${shiftId}|${searching ? 's' : 'b'}`} className={`space-y-2 transition-opacity duration-150 ${q !== dq ? 'opacity-60' : ''}`}>
              {visible.map((k, i) => <Row key={k.id} i={i} kid={k} query={dq} shiftName={multiShift ? shifts[k.shift_id] : undefined} onToggle={onRowToggle} onOpen={onRowOpen} />)}
            </ul>
            {results.length > limit && (
              <button onClick={() => setLimit((l) => l + 100)} className="mt-3 h-11 w-full rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground">
                Показати ще ({results.length - limit})
              </button>
            )}
          </>
        )}
      </main>
      {openKid && <Profile key={openKid.id} kid={openKid} shiftName={shifts[openKid.shift_id]} onClose={() => { setOpenId(null); inputRef.current?.select(); }} onToggle={(k) => toggle(k)} onSaveNote={saveNote} />}
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
