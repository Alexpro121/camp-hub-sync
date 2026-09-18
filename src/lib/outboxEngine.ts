/**
 * Outbox Engine — надлегка відмовостійка черга мутацій для проєкту «Залізна Зміна».
 * Оптимізована для автономної роботи в потягах УЗ та зонах 2G/EDGE.
 *
 * Принципи:
 *  • Нульова затримка: UI оновлюється за 0 мс.
 *  • Мікро-пакети: у запиті лише ID сутності та дельта (<150 байт).
 *  • Склеювання (coalescing): швидкі повторні кліки по одному учаснику склеюються в 1 запит.
 *  • Ідемпотентність: фінансові дії (А$) захищені стабільним клієнтським `txId`.
 *  • Подвійне дзеркало сховища (IndexedDB + LocalStorage) із серіалізованим записом.
 *  • Експоненційний бекоф + «мертва пошта» замість нескінченних ретраїв у БД.
 *  • Синхронізація між вкладками та захист від подвійної відправки.
 */
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';
import { supabase } from '@/integrations/supabase/client';
import { networkPulse } from '@/lib/networkEngine';
import {
  acquireFlushLease,
  backoffDelay,
  createChannel,
  createSerialWriter,
  isPermanentDbError,
  mergeById,
  safeLocalGet,
  safeLocalSet,
  safeUUID,
} from '@/lib/offlineStorage';

export type OutboxType = 'PRESENCE' | 'NOTE' | 'AIR_CHARGE';

export interface OutboxItem {
  id: string;
  type: OutboxType;
  entityId: string;
  payload: Record<string, unknown>;
  /** Клієнтський ключ ідемпотентності для фінансових дій у А$. */
  txId?: string;
  createdAt: number;
  tries: number;
  /** Час наступної дозволеної спроби (бекоф). */
  nextAttemptAt?: number;
  lastError?: string;
}

export interface OutboxState {
  pending: number;
  syncing: boolean;
  failed: number;
}

type Listener = (s: OutboxState) => void;
type FlushListener = (done: number, failed: number) => void;

const store = createStore('ironshift-outbox', 'kv');
const QUEUE_KEY = 'outbox:v2';
const FALLBACK_LS_KEY = 'ironshift:outbox:fallback:v2';
const DEAD_LETTER_KEY = 'ironshift:outbox:dead:v1';
const TEAMS_SNAPSHOT_KEY = 'ironshift:teams-snapshot:v2';
const LEASE_KEY = 'ironshift:outbox:lease';
const CHANNEL_NAME = 'ironshift-outbox';

/** Жорсткий таймаут одного запиту для умов потяга (EDGE / 2G) */
const REQUEST_TIMEOUT_MS = 12000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const MAX_QUEUE = 800;
const MAX_DEAD_LETTERS = 50;

function withTimeout<T>(p: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

class OutboxManager {
  private queue: OutboxItem[] = [];
  private listeners = new Set<Listener>();
  private flushListeners = new Set<FlushListener>();
  private syncing = false;
  private writeIdb = createSerialWriter((value) => idbSet(QUEUE_KEY, value, store));
  private channel = createChannel(CHANNEL_NAME, (data) => this.onChannelMessage(data));

  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initStorage();

    if (typeof window !== 'undefined') {
      // Автоматичний старт синхронізації при появі сигналу
      networkPulse.subscribe((s) => {
        if (s.quality !== 'OFFLINE') void this.flush();
      });

      // Періодичний фоновий пульс скидання черги
      setInterval(() => {
        if (networkPulse.isOnline()) void this.flush();
      }, 15000);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && networkPulse.isOnline()) void this.flush();
      });

      // Остання спроба зберегти чергу перед закриттям вкладки
      window.addEventListener('pagehide', () => this.persistSync());
      window.addEventListener('beforeunload', () => this.persistSync());
    }
  }

  /** Безпечне завантаження з IndexedDB та LocalStorage зі злиттям обох джерел. */
  private async initStorage(): Promise<void> {
    let fromIdb: OutboxItem[] | null = null;
    try {
      fromIdb = (await idbGet<OutboxItem[]>(QUEUE_KEY, store)) ?? null;
    } catch {
      fromIdb = null;
    }
    const fromLs = safeLocalGet<OutboxItem[]>(FALLBACK_LS_KEY);

    // Злиття захищає від втрати дій, якщо один із записів не встиг зберегтися
    this.queue = mergeById<OutboxItem>(fromIdb as any, fromLs as any).filter(
      (i) => i && typeof i.type === 'string' && typeof i.entityId === 'string',
    );
    this.emit();
    if (this.queue.length) void this.persist();
  }

  private onChannelMessage(data: any) {
    if (!data || data.source === 'self') return;
    if (data.type === 'queue' && Array.isArray(data.queue)) {
      // Приймаємо стан іншої вкладки, не втрачаючи власних нових дій
      this.queue = mergeById<OutboxItem>(data.queue, this.queue);
      this.emit();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Дії, які впали і чекають наступної спроби. */
  get failed(): number {
    return this.queue.filter((i) => (i.tries ?? 0) > 0).length;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.snapshotState());
    return () => { this.listeners.delete(l); };
  }

  onFlushComplete(l: FlushListener): () => void {
    this.flushListeners.add(l);
    return () => { this.flushListeners.delete(l); };
  }

  private snapshotState(): OutboxState {
    return { pending: this.queue.length, syncing: this.syncing, failed: this.failed };
  }

  private emit() {
    const s = this.snapshotState();
    this.listeners.forEach((l) => l(s));
  }

  /** Серіалізоване збереження: IndexedDB → LocalStorage-дзеркало → підписники → інші вкладки. */
  private persist(): Promise<void> {
    this.trimQueue();
    const snapshot = this.queue.map((i) => ({ ...i }));
    safeLocalSet(FALLBACK_LS_KEY, snapshot);
    this.emit();
    this.channel.post({ type: 'queue', queue: snapshot });
    return this.writeIdb(snapshot);
  }

  /** Синхронне збереження при закритті вкладки (IndexedDB може не встигнути). */
  private persistSync() {
    safeLocalSet(FALLBACK_LS_KEY, this.queue);
  }

  /** Захист від нескінченного росту черги: фінансові дії ніколи не викидаємо першими. */
  private trimQueue() {
    if (this.queue.length <= MAX_QUEUE) return;
    const financial = this.queue.filter((i) => i.type === 'AIR_CHARGE');
    const rest = this.queue.filter((i) => i.type !== 'AIR_CHARGE');
    const keepRest = rest.slice(Math.max(0, rest.length - (MAX_QUEUE - financial.length)));
    this.queue = mergeById<OutboxItem>(financial, keepRest);
  }

  private moveToDeadLetter(item: OutboxItem, error: unknown) {
    const list = safeLocalGet<OutboxItem[]>(DEAD_LETTER_KEY) ?? [];
    list.push({ ...item, lastError: String((error as any)?.message ?? error ?? 'unknown') });
    safeLocalSet(DEAD_LETTER_KEY, list.slice(-MAX_DEAD_LETTERS));
  }

  /** Дії, які не вдалося застосувати (для діагностики в адмінці). */
  getDeadLetters(): OutboxItem[] {
    return safeLocalGet<OutboxItem[]>(DEAD_LETTER_KEY) ?? [];
  }

  clearDeadLetters() {
    safeLocalSet(DEAD_LETTER_KEY, []);
  }

  /**
   * Додає дію в чергу зі склеюванням дій (Coalescing).
   * Миттєво повертає елемент і запускає фоновий скид.
   */
  enqueue(type: OutboxType, entityId: string, payload: Record<string, unknown>): OutboxItem {
    const coalescable = type === 'PRESENCE' || type === 'NOTE';

    if (coalescable) {
      const idx = this.queue.findIndex((i) => i.type === type && i.entityId === entityId);
      if (idx >= 0) {
        this.queue[idx] = {
          ...this.queue[idx],
          payload: { ...this.queue[idx].payload, ...payload },
          tries: 0,
          nextAttemptAt: undefined,
          lastError: undefined,
          createdAt: Date.now(),
        };
        void this.persist();
        void this.flush();
        return this.queue[idx];
      }
    }

    const item: OutboxItem = {
      id: safeUUID(),
      type,
      entityId,
      payload,
      // txId стабільний на весь час життя дії — повтор не спишe А$ двічі
      txId: type === 'AIR_CHARGE' ? ((payload.txId as string) || safeUUID()) : undefined,
      createdAt: Date.now(),
      tries: 0,
    };

    this.queue.push(item);
    void this.persist();
    void this.flush();
    return item;
  }

  /** Виконання однієї мікро-мутації в Supabase */
  private async run(item: OutboxItem): Promise<void> {
    // 1. Присутність учасника
    if (item.type === 'PRESENCE') {
      const { error } = await withTimeout(
        supabase
          .from('children')
          .update({ is_present: Boolean(item.payload.isPresent) })
          .eq('id', item.entityId)
      );
      if (error) throw error;
      return;
    }

    // 2. Нотатка супроводу
    if (item.type === 'NOTE') {
      const noteValue = String(item.payload.note ?? item.payload.supervisor_notes ?? '');
      const { error } = await withTimeout(
        supabase
          .from('children')
          .update({ note_from_table: noteValue })
          .eq('id', item.entityId)
      );
      if (error) throw error;
      return;
    }

    // 3. Списання Air Pay (А$) з гарантованою ідемпотентністю
    if (item.type === 'AIR_CHARGE') {
      const amount = Number(item.payload.amount ?? item.payload.p_amount ?? 0);
      const label = String(item.payload.label ?? item.payload.p_label ?? 'Оплата на касі (Air Pay)');
      const supervisorTeam = item.payload.supervisorTeam ? Number(item.payload.supervisorTeam) : undefined;

      const { data, error } = await withTimeout(
        supabase.rpc('pay_fair_push_charge', {
          p_child_id: item.entityId,
          p_amount: amount,
          p_tx_id: item.txId,
          p_label: label,
          p_supervisor_team: supervisorTeam,
        })
      );

      if (error) throw error;

      const status = data && typeof data === 'object' ? String((data as any).status ?? '') : '';
      // Бізнес-відмова — дія завершена, повторювати немає сенсу
      if (status && !/ok|success|already_processed|duplicate/i.test(status)) {
        this.moveToDeadLetter(item, `status:${status}`);
      }
    }
  }

  /**
   * Фонова відправка черги (Race-Condition Free).
   * Ніколи не затирає нові дії, додані під час польоту запитів.
   */
  async flush(): Promise<{ done: number; failed: number }> {
    await this.ready;
    if (this.syncing || !this.queue.length) return { done: 0, failed: this.queue.length };
    // Відправляємо, доки пристрій не втратив мережу за сигналом ОС:
    // помилкова оцінка якості зв'язку не має зупиняти синхронізацію.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { done: 0, failed: this.queue.length };
    }

    // Не даємо двом вкладкам відправляти ті самі дії одночасно
    const lease = acquireFlushLease(LEASE_KEY);
    if (!lease) return { done: 0, failed: this.queue.length };

    this.syncing = true;
    this.emit();

    const now = Date.now();
    const snapshot = this.queue.filter((i) => !i.nextAttemptAt || i.nextAttemptAt <= now);
    const completedIds = new Set<string>();
    const retries = new Map<string, Partial<OutboxItem>>();
    let done = 0;

    try {
      for (const item of snapshot) {
        // Якщо під час циклу мережа знову зникла в тунелі — зупиняємось без паніки
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;

        try {
          await this.run(item);
          completedIds.add(item.id);
          done++;
        } catch (e: any) {
          const tries = (item.tries ?? 0) + 1;

          if (isPermanentDbError(e)) {
            // Постійна помилка БД (RLS, FK, дублікат) — не мучимо базу вічно
            this.moveToDeadLetter(item, e);
            completedIds.add(item.id);
            continue;
          }

          retries.set(item.id, {
            tries,
            nextAttemptAt: Date.now() + backoffDelay(tries, 4000, MAX_BACKOFF_MS),
            lastError: String(e?.message ?? e ?? 'network'),
          });
        }
      }
    } finally {
      // ✅ БЕЗПЕЧНЕ ОНОВЛЕННЯ: видаляємо ТІЛЬКИ оброблені ID, зберігаючи всі нові дії!
      this.queue = this.queue
        .filter((item) => !completedIds.has(item.id))
        .map((item) => (retries.has(item.id) ? { ...item, ...retries.get(item.id) } : item));

      this.syncing = false;
      lease.release();
      await this.persist();
    }

    if (done > 0 || retries.size > 0) {
      this.flushListeners.forEach((l) => l(done, this.queue.length));
    }

    return { done, failed: this.queue.length };
  }

  // ── Локальні снепшоти команди (Миттєвий запуск 0 мс) ───────────────────
  saveTeamsSnapshot(data: unknown) {
    safeLocalSet(TEAMS_SNAPSHOT_KEY, { savedAt: Date.now(), data });
  }

  getTeamsSnapshot<T = unknown>(): { savedAt: number; data: T } | null {
    return safeLocalGet<{ savedAt: number; data: T }>(TEAMS_SNAPSHOT_KEY);
  }
}

export const outbox = new OutboxManager();
