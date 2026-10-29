/** Merge acknowledged server rows before overlaying pending local edits. */
export function mergeRegistryRows<T extends { id: string; deleted_at?: string | null }>(rows: T[], changes: T[]): T[] {
  const map = new Map(rows.map((row) => [row.id, row]));
  for (const row of changes) {
    if (row.deleted_at) map.delete(row.id);
    else map.set(row.id, { ...map.get(row.id), ...row });
  }
  return [...map.values()];
}