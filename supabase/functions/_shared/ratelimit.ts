/**
 * [H-2] In-memory sliding-window rate limiter for public login endpoints.
 * Per isolate: enough to slow down credential/roster brute forcing without a
 * round-trip to the database on every attempt.
 */
const buckets = new Map<string, number[]>();

export interface RateVerdict {
  /** Number of failures recorded in the window. */
  hits: number;
  /** Soft threshold reached — the caller should stall the response. */
  slowDown: boolean;
  /** Hard threshold reached — the caller should answer 429. */
  blocked: boolean;
}

export function clientKey(req: Request, extra = ''): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
  const ua = req.headers.get('user-agent') ?? '';
  return `${ip}|${ua.slice(0, 60)}|${extra}`;
}

/** Records one failed attempt and reports the current verdict. */
export function recordFailure(
  key: string,
  opts: { windowMs?: number; slowAfter?: number; blockAfter?: number } = {},
): RateVerdict {
  const windowMs = opts.windowMs ?? 60_000;
  const slowAfter = opts.slowAfter ?? 5;
  const blockAfter = opts.blockAfter ?? 10;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear(); // hard memory ceiling
  return { hits: hits.length, slowDown: hits.length > slowAfter, blocked: hits.length > blockAfter };
}

/** Current verdict without recording a new failure. */
export function peek(key: string, windowMs = 60_000): RateVerdict {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  return { hits: hits.length, slowDown: hits.length > 5, blocked: hits.length > 10 };
}

export function resetFailures(key: string) {
  buckets.delete(key);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
