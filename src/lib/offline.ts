import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';
import { supabase } from '@/integrations/supabase/client';
import { networkPulse } from '@/lib/networkEngine';

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
  lastError?: string;
}

const KEY = 'helpsuprov:offline-queue';
const IDB_KEY = 'queue';
const store = createStore('helpsuprov', 'offline');
const MAX_RETRY_ATTEMPTS = 5;

type QueueListener = (queue: QueuedAction[], syncing: boolean) => void;
const listeners = new Set<QueueListener>();
let syncing = false;

let cache: QueuedAction[] = [];

function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
    } catch {
      /* ignore */
    }

    cache = [...stored, ...legacy];
    if (legacy.length) {
      await idbSet(IDB_KEY, cache, store);
    }
  } catch {
    cache = [];
  }
  notifyListeners();
})();

function notifyListeners() {
  listeners.forEach((l) => l([...cache], syncing));
}

export function readQueue(): QueuedAction[] {
  return [...cache];
}

function writeQueue(q: QueuedAction[]) {
  cache = [...q];
  void idbSet(IDB_KEY, cache, store).catch(() => {});
  notifyListeners();
}

function removeActionFromQueue(id: string) {
  const next = cache.filter((item) => item.id !== id);
  writeQueue(next);
}

function updateActionInQueue(id: string, patch: Partial<QueuedAction>) {
  const next = cache.map((item) => (item.id === id ? { ...item, ...patch } : item));
  writeQueue(next);
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
    };
  } else {
    q.push({
      ...action,
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

const PERMANENT_REGEX =
  /insufficient_funds|forbidden|not_authenticated|fair_closed|child_not_found|invalid_amount|awaiting_target_consent|violates row-level security|violates foreign key|duplicate key/i;

export function isPermanentError(error: unknown): boolean {
  return PERMANENT_REGEX.test(String((error as any)?.message ?? error ?? ''));
}

export async function queuedWrite(
  action: Omit<QueuedAction, 'id' | 'created_at'>
): Promise<{ queued: boolean; error?: unknown }> {
  await ready;

  if (!networkPulse.isOnline()) {
    enqueue(action);
    return { queued: true };
  }

  try {
    await run({ ...action, id: 'live', created_at: Date.now() });
    return { queued: false };
  } catch (error) {
    if (isPermanentError(error)) {
      return { queued: false, error };
    }
    enqueue(action);
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

  if (syncing || !networkPulse.isOnline()) {
    return { done: 0, failed: cache.length };
  }

  if (!cache.length) {
    return { done: 0, failed: 0 };
  }

  syncing = true;
  notifyListeners();

  let done = 0;
  const itemsToProcess = [...cache];

  for (const action of itemsToProcess) {
    if (!networkPulse.isOnline()) {
      break;
    }

    try {
      await run(action);
      removeActionFromQueue(action.id);
      done++;
    } catch (e: any) {
      const isFatal = isPermanentError(e);
      const attempts = (action.attempts || 0) + 1;

      if (isFatal || attempts >= MAX_RETRY_ATTEMPTS) {
        console.warn(`[OfflineQueue] Dropping action ${action.id} (${action.label}):`, e);
        removeActionFromQueue(action.id);
      } else {
        updateActionInQueue(action.id, {
          attempts,
          lastError: String(e?.message || e || 'Network error'),
        });
      }
    }
  }

  syncing = false;
  notifyListeners();

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
