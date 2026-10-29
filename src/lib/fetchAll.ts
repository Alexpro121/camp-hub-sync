/**
 * Постраничне читання: PostgREST віддає максимум 1000 рядків за запит і мовчки
 * обрізає решту, тож великі списки (діти, перекази) читаємо сторінками.
 * Запит у `build` обов'язково має мати стабільне сортування (унікальний ключ останнім),
 * інакше рядки на межах сторінок можуть повторитися або загубитися.
 */
interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

export async function fetchAllRows<T>(
  build: () => RangeQuery<T>,
  pageSize = 1000,
  maxRows = 50_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: out, error };
    const page = data ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: out, error: null };
}
