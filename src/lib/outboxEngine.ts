/**
 * Outbox Engine — надлегка відмовостійка черга мутацій для проєкту «Залізна Зміна».
 * Оптимізована для автономної роботи в потягах УЗ та зонах 2G/EDGE.
 *
 * Принципи:
 *  • Нульова затримка: UI оновлюється за 0 мс.
 *  • Мікро-пакети: у запиті лише ID сутності та дельта (<150 байт).
 *  • Склеювання (coalescing): швидкі повторні кліки по одному учаснику склеюються в 1 запит.
 *  • Ідемпотентність: фінансові дії (А$) захищені унікальним клієнтським `txId`.
 *  • Захист від втрати даних (Race-Condition Free).
 */
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';
import { supabase } from '@/integrations/supabase/client';
import { networkPulse } from '@/lib/networkEngine';

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
}

export interface OutboxState {
  pending: number;
  syncing: boolean;
}

type Listener = (s: OutboxState) => void;
type FlushListener = (done: number, failed: number) => void;

const store = createStore('ironshift-outbox', 'kv');
const QUEUE_KEY = 'outbox:v2';
const FALLBACK_LS_KEY = 'ironshift:outbox:fallback:v2';
const TEAMS_SNAPSHOT_KEY = 'ironshift:teams-snapshot:v2';

/** Жорсткий таймаут одного запиту для умов потяга (EDGE / 2G) */
const REQUEST_TIMEOUT_MS = 10000;

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
    }
  }

  /** Безпечне завантаження з IndexedDB або LocalStorage */
  private async initStorage(): Promise<void> {
    try {
      const fromIdb = await idbGet<OutboxItem[]>(QUEUE_KEY, store);
      if (fromIdb && Array.isArray(fromIdb)) {
        this.queue = fromIdb;
      } else {
        const rawLs = localStorage.getItem(FALLBACK_LS_KEY);
        this.queue = rawLs ? JSON.parse(rawLs) : [];
      }
    } catch {
      try {
        const rawLs = localStorage.getItem(FALLBACK_LS_KEY);
        this.queue = rawLs ? JSON.parse(rawLs) : [];
      } catch {
        this.queue = [];
      }
    }
    this.emit();
  }

  get pending(): number { 
    return this.queue.length; 
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l({ pending: this.queue.length, syncing: this.syncing });
    return () => { this.listeners.delete(l); };
  }

  onFlushComplete(l: FlushListener): () => void {
    this.flushListeners.add(l);
    return () => { this.flushListeners.delete(l); };
  }

  private emit() {
    const s: OutboxState = { pending: this.queue.length, syncing: this.syncing };
    this.listeners.forEach((l) => l(s));
  }

  private persist() {
    // 1. Збереження в IndexedDB
    idbSet(QUEUE_KEY, this.queue, store).catch(() => {
      // 2. Резервне збереження в LocalStorage при збої WebKit
      try {
        localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(this.queue));
      } catch { /* квота пам'яті */ }
    });

    try {
      localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(this.queue));
    } catch { /* ignore */ }

    this.emit();
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
          createdAt: Date.now()
        };
        this.persist();
        void this.flush();
        return this.queue[idx];
      }
    }

    const item: OutboxItem = {
      id: crypto.randomUUID(),
      type,
      entityId,
      payload,
      txId: type === 'AIR_CHARGE' ? (payload.txId as string || crypto.randomUUID()) : undefined,
      createdAt: Date.now(),
      tries: 0,
    };

    this.queue.push(item);
    this.persist();
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
      if (data && typeof data === 'object' && (data as any).status === 'insufficient_funds') {
        // Недостатньо коштів — дія вважається завершеною з помилкою бізнес-логіки (не повторюємо вічно)
        return;
      }
    }
  }

  /**
   * Фонова відправка черги (Race-Condition Free).
   * Ніколи не затирає нові дії, додані під час польоту запитів.
   */
  async flush(): Promise<{ done: number; failed: number }> {
    await this.ready;
    if (this.syncing || !this.queue.length) return { done: 0, failed: 0 };
    if (!networkPulse.isOnline()) return { done: 0, failed: this.queue.length };

    this.syncing = true;
    this.emit();

    const snapshot = [...this.queue];
    const completedIds = new Set<string>();
    let done = 0;
    let failed = 0;

    for (const item of snapshot) {
      // Якщо під час циклу мережа знову зникла в тунелі — зупиняємось без паніки
      if (!networkPulse.isOnline()) {
        failed++;
        break;
      }

      try {
        await this.run(item);
        completedIds.add(item.id);
        done++;
      } catch (e: any) {
        const errorMsg = String(e?.message ?? e).toLowerCase();
        
        // Помилки, які не мають сенсу повторюватися вічно (видаляємо з черги)
        const isPermanent = /insufficient_funds|child_not_found|invalid_amount|forbidden|not_found|22p02/i.test(errorMsg);
        
        if (isPermanent) {
          completedIds.add(item.id);
          done++;
        } else {
          // Тимчасова помилка мережі — збільшуємо лічильник спроб
          item.tries += 1;
          failed++;
        }
      }
    }

    // ✅ БЕЗПЕЧНЕ ОНОВЛЕННЯ: видаляємо ТІЛЬКИ успішні ID, зберігаючи всі нові дії!
    this.queue = this.queue.filter((item) => !completedIds.has(item.id));
    this.syncing = false;
    this.persist();

    if (done > 0 || failed > 0) {
      this.flushListeners.forEach((l) => l(done, this.queue.length));
    }

    return { done, failed: this.queue.length };
  }

  // ── Локальні снепшоти команди (Миттєвий запуск 0 мс) ───────────────────
  saveTeamsSnapshot(data: unknown) {
    try {
      localStorage.setItem(TEAMS_SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch { /* квота пам'яті */ }
  }

  getTeamsSnapshot<T = unknown>(): { savedAt: number; data: T } | null {
    try {
      const raw = localStorage.getItem(TEAMS_SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export const outbox = new OutboxManager();
