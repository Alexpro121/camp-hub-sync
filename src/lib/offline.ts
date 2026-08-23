import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';
import { supabase } from '@/integrations/supabase/client';

export interface QueuedAction {
  id: string;
  table: 'children' | 'iron_dollar_transactions' | 'talent_entries' | 'broadcasts';
  /** `rpc` runs an atomic, idempotent server function instead of a plain write. */
  op: 'update' | 'insert' | 'rpc';
  matchId?: string;
  values: Record<string, any>;
  /** Server function name for `op: 'rpc'`. */
  fn?: 'increment_iron_dollars';
  /** Guarantees a replayed action is applied exactly once. */
  idempotencyKey?: string;
  /** [L-1] Optimistic lock: when the server row is newer, text fields are merged. */
  clientUpdatedAt?: string;
  /** Text columns that must be merged (appended) instead of overwritten. */
  mergeFields?: string[];
  label: string;
  created_at: number;
}


const KEY = 'helpsuprov:offline-queue';
/** IndexedDB store — no 5 MB localStorage ceiling. */
const store = createStore('helpsuprov', 'offline');
const IDB_KEY = 'queue';

type QueueListener = (queue: QueuedAction[], syncing: boolean) => void;
const listeners = new Set<QueueListener>();
let syncing = false;

/** In-memory mirror so callers stay synchronous while IndexedDB is async. */
let cache: QueuedAction[] = [];

/** Hydrate from IndexedDB once, migrating any legacy localStorage queue. */
export const ready: Promise<void> = (async () => {
  try {
    const stored = (await idbGet<QueuedAction[]>(IDB_KEY, store)) ?? [];
    let legacy: QueuedAction[] = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        legacy = JSON.parse(raw) as QueuedAction[];
        localStorage.removeItem(KEY);
      }
    } catch { /* ignore malformed legacy payload */ }
    cache = [...stored, ...legacy];
    if (legacy.length) await idbSet(IDB_KEY, cache, store);
  } catch {
    cache = [];
  }
  listeners.forEach((l) => l(cache, syncing));
})();

export function readQueue(): QueuedAction[] {
  return cache;
}

function writeQueue(q: QueuedAction[]) {
  cache = q;
  void idbSet(IDB_KEY, q, store).catch(() => { /* storage unavailable */ });
  listeners.forEach((l) => l(q, syncing));
}

export function onQueueChange(fn: QueueListener) {
  listeners.add(fn);
  fn(readQueue(), syncing);
  return () => listeners.delete(fn);
}

function enqueue(action: Omit<QueuedAction, 'id' | 'created_at'>) {
  const q = readQueue();
  // Collapse repeated updates to the same row+fields. Never collapse `rpc`
  // deltas — each one is a distinct, idempotency-keyed operation.
  const idx = q.findIndex(
    (a) => a.op === 'update' && action.op === 'update' && a.table === action.table && a.matchId === action.matchId,
  );
  if (idx >= 0) {
    q[idx] = { ...q[idx], values: { ...q[idx].values, ...action.values }, label: action.label };
  } else {
    q.push({ ...action, id: crypto.randomUUID(), created_at: Date.now() });
  }
  writeQueue(q);
}

/** Formats a merge marker so a colleague's note is never silently overwritten. */
export function mergeNotes(serverText: string | null, clientText: string | null, at = new Date()): string {
  const server = (serverText ?? '').trim();
  const client = (clientText ?? '').trim();
  if (!server) return client;
  if (!client || server === client || server.includes(client)) return server;
  const stamp = at.toLocaleString('uk-UA', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return `${server}\n— офлайн-нотатка (${stamp}) —\n${client}`;
}

/**
 * [L-1] Optimistic locking. If the server row changed after the client edit was
 * captured, merge the configured text columns instead of clobbering them.
 */
async function resolveConflicts(a: QueuedAction): Promise<Record<string, any>> {
  if (!a.clientUpdatedAt || !a.mergeFields?.length || !a.matchId) return a.values;
  try {
    const { data } = await supabase
      .from(a.table as any)
      .select(['updated_at', ...a.mergeFields].join(', '))
      .eq('id', a.matchId)
      .maybeSingle();
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
    const { error } = await supabase.rpc(a.fn, {
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

/** Perform a write immediately when online, otherwise store it in the offline queue. */
export async function queuedWrite(
  action: Omit<QueuedAction, 'id' | 'created_at'>,
): Promise<{ queued: boolean; error?: unknown }> {
  await ready;
  if (!navigator.onLine) {
    enqueue(action);
    return { queued: true };
  }
  try {
    await run({ ...action, id: 'live', created_at: Date.now() });
    return { queued: false };
  } catch (error) {
    enqueue(action);
    return { queued: true, error };
  }
}

/**
 * Atomic, replay-safe Iron Dollar change. Online it hits the server function
 * directly; offline it is queued with a stable idempotency key so a retry after
 * reconnect can never credit the same coins twice.
 */
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
    idempotencyKey: crypto.randomUUID(),
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
  if (syncing || !navigator.onLine) return { done: 0, failed: 0 };
  const q = readQueue();
  if (!q.length) return { done: 0, failed: 0 };
  syncing = true;
  listeners.forEach((l) => l(q, true));

  const rest: QueuedAction[] = [];
  let done = 0;
  for (const a of q) {
    try {
      await run(a);
      done++;
    } catch {
      rest.push(a);
    }
  }
  syncing = false;
  writeQueue(rest);
  return { done, failed: rest.length };
}