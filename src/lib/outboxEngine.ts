/**
 * Outbox Engine — надлегка черга мутацій для роботи в потязі / 2G.
 *
 * Принципи:
 *  • Мікро-дельти: у пакеті лише ID сутності та мінімальне значення (<150 байт).
 *  • Склеювання (coalescing): 5 перемикань статусу однієї дитини = 1 запит.
 *  • Ідемпотентність: фінансові дії мають клієнтський `txId`.
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
  /** Клієнтський ключ ідемпотентності для фінансових дій. */
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
const QUEUE_KEY = 'outbox:v1';
const TEAMS_SNAPSHOT_KEY = 'ironshift:teams-snapshot:v1';
/** Жорсткий таймаут одного запиту — не даємо черзі зависнути на 2G. */
const REQUEST_TIMEOUT_MS = 12000;

function withTimeout<T>(p: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
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
    this.ready = (async () => {
      try {
        this.queue = (await idbGet<OutboxItem[]>(QUEUE_KEY, store)) ?? [];
      } catch {
        this.queue = [];
      }
      this.emit();
    })();

    if (typeof window !== 'undefined') {
      networkPulse.subscribe((s) => { if (s.quality !== 'OFFLINE') void this.flush(); });
      setInterval(() => { if (networkPulse.isOnline()) void this.flush(); }, 15000);
    }
  }

  get pending(): number { return this.queue.length; }

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
    void idbSet(QUEUE_KEY, this.queue, store).catch(() => { /* сховище недоступне */ });
    this.emit();
  }

  /** Додає мікро-дельту в чергу зі склеюванням дублікатів однієї сутності. */
  enqueue(type: OutboxType, entityId: string, payload: Record<string, unknown>): OutboxItem {
    const coalescable = type === 'PRESENCE' || type === 'NOTE';
    if (coalescable) {
      const idx = this.queue.findIndex((i) => i.type === type && i.entityId === entityId);
      if (idx >= 0) {
        this.queue[idx] = { ...this.queue[idx], payload: { ...this.queue[idx].payload, ...payload }, tries: 0 };
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
      txId: type === 'AIR_CHARGE' ? crypto.randomUUID() : undefined,
      createdAt: Date.now(),
      tries: 0,
    };
    this.queue.push(item);
    this.persist();
    void this.flush();
    return item;
  }

  private async run(item: OutboxItem): Promise<void> {
    if (item.type === 'PRESENCE') {
      const { error } = await withTimeout(
        supabase.from('children').update({ is_present: Boolean(item.payload.isPresent) }).eq('id', item.entityId),
      );
      if (error) throw error;
      return;
    }
    if (item.type === 'NOTE') {
      const { error } = await withTimeout(
        supabase.from('children').update({ supervisor_notes: String(item.payload.note ?? '') }).eq('id', item.entityId),
      );
      if (error) throw error;
      return;
    }
    // AIR_CHARGE — атомарне списання А$ із захистом від подвійного проведення.
    const { error } = await withTimeout(
      supabase.rpc('pay_fair_push_charge', {
        p_child_id: item.entityId,
        p_tx_id: item.txId,
        ...(item.payload as Record<string, never>),
      } as never),
    );
    if (error) throw error;
  }

  /** Фонова послідовна відправка. Ніколи не блокує інтерфейс. */
  async flush(): Promise<{ done: number; failed: number }> {
    await this.ready;
    if (this.syncing || !this.queue.length) return { done: 0, failed: 0 };
    if (!networkPulse.isOnline()) return { done: 0, failed: this.queue.length };

    this.syncing = true;
    this.emit();

    const rest: OutboxItem[] = [];
    let done = 0;
    for (const item of [...this.queue]) {
      try {
        await this.run(item);
        done++;
      } catch (e) {
        const permanent = /forbidden|not_authenticated|insufficient_funds|invalid_amount|row-level security/i
          .test(String((e as Error)?.message ?? e));
        if (!permanent) rest.push({ ...item, tries: item.tries + 1 });
      }
    }
    this.queue = rest;
    this.syncing = false;
    this.persist();
    if (done > 0 || rest.length > 0) this.flushListeners.forEach((l) => l(done, rest.length));
    return { done, failed: rest.length };
  }

  // ── Локальні снепшоти (миттєвий старт без мережі) ────────────────────────
  saveTeamsSnapshot(data: unknown) {
    try {
      localStorage.setItem(TEAMS_SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch { /* квота вичерпана */ }
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
