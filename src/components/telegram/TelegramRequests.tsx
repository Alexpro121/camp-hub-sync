import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { isTelegramMiniApp, tgApp } from '@/lib/telegramAuth';

/**
 * Заявки з Telegram у застосунку.
 *  - mode="admin": посилання для реєстрації працівників, заявки на реєстрацію і всі запити переприв'язки дітей;
 *  - mode="staff": запити переприв'язки дітей своєї команди (нічого не показує, якщо їх немає).
 * Працює лише всередині Telegram: сервер перевіряє права за підписаним Telegram ID.
 */

interface StaffRequest { id: string; full_name: string; phone: string; kind: string; tg_name: string | null; tg_username: string | null }
interface Rebind { id: string; child_name: string; team_number: number; tg_user_id?: number; tg_name: string | null; tg_username: string | null; created_at?: string }

const KIND_LABEL: Record<string, string> = { supervisor: 'Супровід', duckling: 'Каченя', doctor: 'Лікар' };
const btn = 'min-h-[40px] px-3 rounded-lg text-sm font-semibold active:scale-[0.97] transition-transform disabled:opacity-50';
const who = (name: string | null, username: string | null) => `${name ?? ''}${username ? ` (@${username})` : ''}`;

const TelegramRequests = ({ mode }: { mode: 'admin' | 'staff' }) => {
  const [link, setLink] = useState<string | null>(null);
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [rebinds, setRebinds] = useState<Rebind[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const enabled = isTelegramMiniApp();

  const load = useCallback(async () => {
    try {
      if (mode === 'admin') {
        const res = await tgApp<{ link: string | null; requests: StaffRequest[]; rebinds: Rebind[] }>('admin_overview');
        setLink(res.link); setRequests(res.requests ?? []); setRebinds(res.rebinds ?? []);
      } else {
        const res = await tgApp<{ rebinds: Rebind[] }>('rebind_list');
        setRebinds(res.rebinds ?? []);
      }
    } catch { /* без зв'язку — спробуємо при наступному відкритті */ }
    setLoaded(true);
  }, [mode]);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  if (!enabled || !loaded) return null;
  if (mode === 'staff' && !rebinds.length) return null;

  const decide = async (action: 'request_decide' | 'rebind_decide', id: string, approve: boolean, kind?: string) => {
    setBusyId(id);
    try {
      const res = await tgApp<{ ok: boolean; message: string }>(action, { id, approve, kind });
      (res.ok ? toast.success : toast.error)(res.message);
      await load();
    } catch { toast.error('Не вдалося. Спробуйте ще раз.'); }
    setBusyId(null);
  };

  const copyLink = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast.success('Посилання скопійовано'); }
    catch { toast.error('Не вдалося скопіювати'); }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold inline-flex items-center gap-1.5"><Send className="w-4 h-4" /> Telegram</h2>

      {mode === 'admin' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Посилання для реєстрації супроводу, каченят і лікарів. Надсилайте лише працівникам — кожну заявку ви підтверджуєте окремо.</p>
          {link ? (
            <div className="flex gap-2 min-w-0">
              <code className="flex-1 min-w-0 truncate rounded-lg bg-muted px-3 py-2 text-xs">{link}</code>
              <button type="button" onClick={copyLink} className={`${btn} bg-primary text-primary-foreground`} aria-label="Скопіювати посилання"><Copy className="w-4 h-4" /></button>
            </div>
          ) : <p className="text-xs text-muted-foreground">Посилання недоступне: перевірте налаштування бота.</p>}
        </div>
      )}

      {mode === 'admin' && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground">Заявки на реєстрацію {requests.length ? `· ${requests.length}` : ''}</h3>
          {!requests.length && <p className="text-xs text-muted-foreground">Нових заявок немає.</p>}
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
              <div className="text-sm">
                <p className="font-bold">{r.full_name}</p>
                <p className="text-xs text-muted-foreground">Обрано: {KIND_LABEL[r.kind] ?? r.kind} · {r.phone}</p>
                <p className="text-xs text-muted-foreground">Telegram: {who(r.tg_name, r.tg_username)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <button key={k} type="button" disabled={busyId === r.id} onClick={() => decide('request_decide', r.id, true, k)}
                    className={`${btn} ${k === r.kind ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>✅ {label}</button>
                ))}
                <button type="button" disabled={busyId === r.id} onClick={() => decide('request_decide', r.id, false)}
                  className={`${btn} bg-destructive text-destructive-foreground`}>Відхилити</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-bold text-muted-foreground">Повторний вхід дітей {rebinds.length ? `· ${rebinds.length}` : ''}</h3>
        {!rebinds.length && <p className="text-xs text-muted-foreground">Запитів немає.</p>}
        {rebinds.map((r) => (
          <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-sm"><b>{r.child_name}</b>, команда {r.team_number}</p>
            <p className="text-xs text-muted-foreground">
              Новий Telegram: {who(r.tg_name, r.tg_username) || 'без імені'}{r.tg_user_id ? ` · ID ${r.tg_user_id}` : ''}
              {r.created_at ? ` · ${new Date(r.created_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Ім'я в Telegram людина вписує сама — воно нічого не доводить. Підтверджуйте, лише коли дитина поруч і показує цей акаунт на своєму телефоні: попередній акаунт втратить доступ.
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={busyId === r.id} onClick={() => decide('rebind_decide', r.id, true)} className={`${btn} bg-primary text-primary-foreground`}>
                {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Переприв\'язати'}
              </button>
              <button type="button" disabled={busyId === r.id} onClick={() => decide('rebind_decide', r.id, false)} className={`${btn} bg-muted text-foreground`}>Відхилити</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TelegramRequests;
