/**
 * Спільний замок відправки для обох офлайн-черг (offline.ts і outboxEngine.ts).
 * Гарантує, що скиди йдуть строго по черзі і ніколи не перемішуються в мережі.
 */
let chain: Promise<unknown> = Promise.resolve();

export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}
