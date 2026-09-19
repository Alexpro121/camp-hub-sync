/**
 * Універсальна офлайн-черга записів у базу для проєкту «Залізна Зміна».
 *
 * Надійність:
 *  • Подвійне дзеркало (IndexedDB + LocalStorage) із серіалізованим записом.
 *  • Злиття джерел при старті — дії не губляться навіть після аварійного закриття.
 *  • Експоненційний бекоф + «мертва пошта» замість нескінченного довбання бази.
 *  • Ідемпотентність фінансових RPC (стабільний ключ на весь час життя дії).
 *  • Міжвкладкова синхронізація та лок, щоб дія не відправилась двічі.
 */
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';
import { supabase } from '@/integrations/supabase/client';
import { networkPulse } from '@/lib/networkEngine';
import {
  acquireFlushLease,
  backoffDelay,
  createChannel,
  createSerialWriter,
  createTombstones,
  isPermanentDbError,
  mergeById,
  safeLocalGet,
  safeLocalSet,
  safeUUID,
} from '@/lib/offlineStorage';

export interface QueuedAction {
  id: string;
  table: 'children' | 'iron_dollar_transactions' | 'talent_entries' | 'broadcasts' | string;
  op: 'update' | 'insert' | 'rpc';
  matchId?: string;
  values: Record<string, any>;
  fn?: 'increment_iron_dollars' | string;
  idempotencyKey?: string;
  clientUpdatedAt?: string;
  mergeFields?: string[];
  label: string;
  created_at: number;
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string;
}

const LEGACY_KEY = 'helpsuprov:offline-queue';
const MIRROR_KEY = 'helpsuprov:offline-queue:mirror';
const DEAD_LETTER_KEY = 'helpsuprov:offline-queue:dead';
const LEASE_KEY = 'helpsuprov:offline-queue:lease';
const IDB_KEY = 'queue';
const store = createStore('helpsuprov', 'offline');
/** Мережеві збої НІКОЛИ не видаляють дію — лише збільшують паузу до повтору. */
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const MAX_QUEUE = 500;
const MAX_DEAD_LETTERS = 50;

type QueueListener = (queue: QueuedAction[], syncing: boolean) => void;
const listeners = new Set<QueueListener>();
let syncing = false;
let cache: QueuedAction[] = [];

const writeIdb = createSerialWriter((value) => idbSet(IDB_KEY, value, store));
/** Уже відправлені дії — щоб злиття дзеркал чи вкладок не воскресило їх. */
const tombstones = createTombstones('helpsuprov:offline-queue:done');
const channel = createChannel('helpsuprov-offline-queue', (data) => {
  if (data?.type === 'queue' && Array.isArray(data.queue)) {
    cache = tombstones.filter(
      mergeById<any>(data.queue, cache, (i: any) => i.created_at ?? 0),
    );
    notifyListeners();
  }
});

export const ready: Promise<void> = (async () => {
  let stored: QueuedAction[] | null = null;
  try {
    stored = (await idbGet<QueuedAction[]>(IDB_KEY, store)) ?? null;
  } catch {
    stored = null;
  }

  const mirror = safeLocalGet<QueuedAction[]>(MIRROR_KEY);
  const legacy = safeLocalGet<QueuedAction[]>(LEGACY_KEY);
  try {
    if (legacy) localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }

  cache = tombstones.filter(
    mergeById<any>(
      mergeById<any>(stored as any, mirror as any, (i: any) => i.created_at ?? 0),
      (legacy ?? []) as any,
      (i: any) => i.created_at ?? 0,
    ).filter((a: any) => a && typeof a.table === 'string' && typeof a.op === 'string'),
  );

  if (cache.length) writeQueue(cache);
  notifyListeners();
})();

function notifyListeners() {
  const snapshot = cache.map((a) => ({ ...a }));
  listeners.forEach((l) => l(snapshot, syncing));
}

export function readQueue(): QueuedAction[] {
  return [...cache];
}

function trim(q: QueuedAction[]): QueuedAction[] {
  if (q.length <= MAX_QUEUE) return q;
  const financial = q.filter((a) => a.op === 'rpc');
  const rest = q.filter((a) => a.op !== 'rpc');
  return [...financial, ...rest.slice(Math.max(0, rest.length - (MAX_QUEUE - financial.length)))];
}

function writeQueue(q: QueuedAction[]) {
  cache = trim(q.map((a) => ({ ...a })));
  safeLocalSet(MIRROR_KEY, cache);
  void writeIdb(cache);
  channel.post({ type: 'queue', queue: cache });
  notifyListeners();
}

function moveToDeadLetter(action: QueuedAction, error: unknown) {
  const list = safeLocalGet<QueuedAction[]>(DEAD_LETTER_KEY) ?? [];
  list.push({ ...action, lastError: String((error as any)?.message ?? error ?? 'unknown') });
  safeLocalSet(DEAD_LETTER_KEY, list.slice(-MAX_DEAD_LETTERS));
}

export function getDeadLetters(): QueuedAction[] {
  return safeLocalGet<QueuedAction[]>(DEAD_LETTER_KEY) ?? [];
}

export function clearDeadLetters() {
  safeLocalSet(DEAD_LETTER_KEY, []);
}

export function onQueueChange(fn: QueueListener) {
  listeners.add(fn);
  fn(readQueue(), syncing);
  return () => listeners.delete(fn);
}

function enqueue(action: Omit<QueuedAction, 'id' | 'created_at'>) {
  const q = [...cache];

  const idx = q.findIndex(
    (a) =>
      a.op === 'update' &&
      action.op === 'update' &&
      a.table === action.table &&
      a.matchId === action.matchId
  );

  if (idx >= 0) {
    q[idx] = {
      ...q[idx],
      values: { ...q[idx].values, ...action.values },
      label: action.label,
      attempts: 0,
      nextAttemptAt: undefined,
      lastError: undefined,
    };
  } else {
    q.push({
      ...action,
      // Ключ ідемпотентності фіксуємо один раз — повтор не продублює транзакцію
      idempotencyKey: action.op === 'rpc' ? (action.idempotencyKey ?? safeUUID()) : action.idempotencyKey,
      id: safeUUID(),
      created_at: Date.now(),
      attempts: 0,
    });
  }

  writeQueue(q);
}

export function mergeNotes(serverText: string | null, clientText: string | null, at = new Date()): string {
  const server = (serverText ?? '').trim();
  const client = (clientText ?? '').trim();
  if (!server) return client;
  if (!client || server === client || server.includes(client)) return server;
  const stamp = at.toLocaleString('uk-UA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return `${server}\n— офлайн-нотатка (${stamp}) —\n${client}`;
}

async function resolveConflicts(a: QueuedAction): Promise<Record<string, any>> {
  if (!a.clientUpdatedAt || !a.mergeFields?.length || !a.matchId) return a.values;
  try {
    const { data, error } = await supabase
      .from(a.table as any)
      .select(['updated_at', ...a.mergeFields].join(', '))
      .eq('id', a.matchId)
      .maybeSingle();

    if (error) return a.values;
    const server = data as Record<string, any> | null;
    if (!server?.updated_at) return a.values;
    if (new Date(server.updated_at).getTime() <= new Date(a.clientUpdatedAt).getTime()) return a.values;

    const merged = { ...a.values };
    for (const f of a.mergeFields) {
      merged[f] = mergeNotes(server[f] ?? null, a.values[f] ?? null, new Date(a.created_at));
    }
    return merged;
  } catch {
    return a.values;
  }
}

async function run(a: QueuedAction) {
  if (a.op === 'rpc' && a.fn) {
    const { error } = await supabase.rpc(a.fn as any, {
      ...(a.values as any),
      p_idempotency_key: a.idempotencyKey ?? null,
    });
    if (error) throw error;
  } else if (a.op === 'update' && a.matchId) {
    const values = await resolveConflicts(a);
    const { error } = await supabase.from(a.table as any).update(values).eq('id', a.matchId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(a.table as any).insert(a.values);
    if (error) throw error;
  }
}

/** Пристрій точно без мережі (сигнал ОС), а не здогадка про якість зв'язку. */
function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isPermanentError(error: unknown): boolean {
  return isPermanentDbError(error);
}

export async function queuedWrite(
  action: Omit<QueuedAction, 'id' | 'created_at'>
): Promise<{ queued: boolean; error?: unknown }> {
  await ready;

  // Черга лише коли пристрій справді офлайн: помилкова оцінка якості зв'язку
  // не має відкладати запис, який реально пройшов би.
  if (isDeviceOffline()) {
    enqueue(action);
    return { queued: true };
  }

  const prepared = {
    ...action,
    idempotencyKey: action.op === 'rpc' ? (action.idempotencyKey ?? safeUUID()) : action.idempotencyKey,
  };

  try {
    await run({ ...prepared, id: 'live', created_at: Date.now() });
    return { queued: false };
  } catch (error) {
    if (isPermanentError(error)) {
      return { queued: false, error };
    }
    enqueue(prepared);
    return { queued: true, error };
  }
}

export async function queuedIronDollarChange(opts: {
  childId: string;
  amount: number;
  reason?: string | null;
  supervisorId?: string | null;
  label: string;
}): Promise<{ queued: boolean; error?: unknown }> {
  return queuedWrite({
    table: 'iron_dollar_transactions',
    op: 'rpc',
    fn: 'increment_iron_dollars',
    idempotencyKey: safeUUID(),
    label: opts.label,
    values: {
      p_child_id: opts.childId,
      p_amount: opts.amount,
      p_reason: opts.reason ?? null,
      p_supervisor_id: opts.supervisorId ?? null,
    },
  });
}

export async function flushQueue(): Promise<{ done: number; failed: number }> {
  await ready;

  if (syncing || isDeviceOffline() || !cache.length) {
    return { done: 0, failed: cache.length };
  }

  const lease = acquireFlushLease(LEASE_KEY);
  if (!lease) return { done: 0, failed: cache.length };

  syncing = true;
  notifyListeners();

  let done = 0;
  const now = Date.now();
  const itemsToProcess = cache.filter((a) => !a.nextAttemptAt || a.nextAttemptAt <= now);
  const completed = new Set<string>();
  const retries = new Map<string, Partial<QueuedAction>>();

  try {
    for (const action of itemsToProcess) {
      if (isDeviceOffline()) break;

      try {
        await run(action);
        completed.add(action.id);
        done++;
      } catch (e: any) {
        const attempts = (action.attempts || 0) + 1;

        if (isPermanentError(e)) {
          // База відхилила запис назавжди (немає прав, дублікат, звʼязок) — зберігаємо в журнал
          console.warn(`[OfflineQueue] Permanent failure ${action.id} (${action.label}):`, e);
          moveToDeadLetter(action, e);
          completed.add(action.id);
          continue;
        }

        // Тимчасова помилка мережі — дія лишається в черзі назавжди
        retries.set(action.id, {
          attempts,
          nextAttemptAt: Date.now() + backoffDelay(attempts, 4000, MAX_BACKOFF_MS),
          lastError: String(e?.message || e || 'Network error'),
        });
      }
    }
  } finally {
    // Фіксуємо завершені дії, щоб вони не повернулись із дзеркала чи іншої вкладки
    if (completed.size) tombstones.mark(completed);
    const next = cache
      .filter((a) => !completed.has(a.id))
      .map((a) => (retries.has(a.id) ? { ...a, ...retries.get(a.id) } : a));
    syncing = false;
    lease.release();
    writeQueue(next);
  }

  return { done, failed: cache.length };
}

let autoFlushTimer: ReturnType<typeof setTimeout> | null = null;

networkPulse.subscribe((state) => {
  if (state.quality !== 'OFFLINE' && !syncing && cache.length > 0) {
    if (autoFlushTimer) clearTimeout(autoFlushTimer);
    autoFlushTimer = setTimeout(() => {
      void flushQueue();
    }, 800);
  }
});

if (typeof window !== 'undefined') {
  // Регулярний пульс: підбирає дії, чия пауза бекофу вже минула
  setInterval(() => {
    if (!isDeviceOffline() && cache.length) void flushQueue();
  }, 20000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !isDeviceOffline()) void flushQueue();
  });

  window.addEventListener('pagehide', () => {
    safeLocalSet(MIRROR_KEY, cache);
  });
}
