import { supabase } from '@/integrations/supabase/client';

export interface QueuedAction {
  id: string;
  table: 'children' | 'iron_dollar_transactions' | 'talent_entries' | 'broadcasts';
  op: 'update' | 'insert';
  matchId?: string;
  values: Record<string, any>;
  label: string;
  created_at: number;
}

const KEY = 'helpsuprov:offline-queue';

type QueueListener = (queue: QueuedAction[], syncing: boolean) => void;
const listeners = new Set<QueueListener>();
let syncing = false;

export function readQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedAction[]) {
  localStorage.setItem(KEY, JSON.stringify(q));
  listeners.forEach((l) => l(q, syncing));
}

export function onQueueChange(fn: QueueListener) {
  listeners.add(fn);
  fn(readQueue(), syncing);
  return () => listeners.delete(fn);
}

function enqueue(action: Omit<QueuedAction, 'id' | 'created_at'>) {
  const q = readQueue();
  // Collapse repeated updates to the same row+fields
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

async function run(a: QueuedAction) {
  if (a.op === 'update' && a.matchId) {
    const { error } = await supabase.from(a.table as any).update(a.values).eq('id', a.matchId);
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

export async function flushQueue(): Promise<{ done: number; failed: number }> {
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