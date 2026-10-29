/** Merge acknowledged server rows before overlaying pending local edits. */
export function mergeRegistryRows<T extends { id: string; deleted_at?: string | null }>(rows: T[], changes: T[]): T[] {
  const map = new Map(rows.map((row) => [row.id, row]));
  for (const row of changes) {
    if (row.deleted_at) map.delete(row.id);
    else map.set(row.id, { ...map.get(row.id), ...row });
  }
  return [...map.values()];
}

export function patchRegistryRows<T extends { id: string; updated_at?: string }>(rows: T[], changes: (Partial<T> & { id: string })[]): T[] {
  const patches = new Map(changes.map((p) => [p.id, p]));
  return rows.map((row) => {
    const patch = patches.get(row.id);
    if (!patch || (row.updated_at && patch.updated_at && row.updated_at > patch.updated_at)) return row;
    return { ...row, ...patch };
  });
}

/** Update existing scoped caches only: batch replies are partial child records. */
export function persistRegistryPatches<T extends { id: string; updated_at?: string }>(storage: Storage, changes: (Partial<T> & { id: string })[]) {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith('ironshift:registry-list:')) continue;
    try {
      const cached = JSON.parse(storage.getItem(key) ?? 'null');
      if (!Array.isArray(cached?.children)) continue;
      storage.setItem(key, JSON.stringify({ ...cached, children: patchRegistryRows(cached.children, changes) }));
    } catch { /* Corrupt cache or quota must not prevent acknowledgement. */ }
  }
}

export function readRegistryScope(storage: Storage): string | null | undefined {
  try {
    const saved = storage.getItem('ironshift:registry-scope');
    if (saved === 'all') return null;
    return saved && /^[0-9a-f-]{36}$/i.test(saved) ? saved : undefined;
  } catch { return undefined; }
}