import { describe, expect, it } from 'vitest';
import { fetchAllRows } from '@/lib/fetchAll';

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
const source = (rows: { id: number }[]) => () => ({
  range: async (a: number, b: number) => ({ data: rows.slice(a, b + 1), error: null }),
});

describe('fetchAllRows', () => {
  it('читає понад 1000 рядків без обрізання', async () => {
    const { data } = await fetchAllRows(source(table(2500)));
    expect(data).toHaveLength(2500);
    expect(data[2499].id).toBe(2499);
  });
  it('рівно кратна розміру сторінки кількість не зациклюється', async () => {
    expect((await fetchAllRows(source(table(2000)))).data).toHaveLength(2000);
  });
  it('повертає помилку разом із прочитаним', async () => {
    const res = await fetchAllRows(() => ({ range: async (a: number) => (a === 0 ? { data: table(1000), error: null } : { data: null, error: { message: 'boom' } }) }));
    expect(res.error?.message).toBe('boom');
    expect(res.data).toHaveLength(1000);
  });
});
