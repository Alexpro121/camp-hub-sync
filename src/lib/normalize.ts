// Normalize Ukrainian names for fuzzy matching: lowercase, trim, remove extra spaces
export function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[''`ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

export function parseTeamNumber(v: any): number {
  if (typeof v === 'number') return Math.floor(v);
  const s = String(v ?? '').replace(/[^\d]/g, '');
  return s ? parseInt(s, 10) : 0;
}

/* ---------- Fuzzy matching for child login ---------- */

// Levenshtein distance — number of single-char edits to transform a → b
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev: number[] = Array.from({ length: n + 1 });
  let curr: number[] = Array.from({ length: n + 1 });
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Order-independent token similarity for full names (last/first/middle can be in any order)
function tokenSetSimilarity(a: string, b: string): number {
  const at = normalizeName(a).split(' ').filter(Boolean).sort();
  const bt = normalizeName(b).split(' ').filter(Boolean).sort();
  if (!at.length || !bt.length) return 0;
  const joinedA = at.join(' ');
  const joinedB = bt.join(' ');
  const maxLen = Math.max(joinedA.length, joinedB.length);
  if (!maxLen) return 0;
  const dist = levenshtein(joinedA, joinedB);
  return 1 - dist / maxLen;
}

// Check if every query token has a near-match among target tokens (handles typos in any token)
function tokenCoverage(query: string, target: string): number {
  const qt = normalizeName(query).split(' ').filter(Boolean);
  const tt = normalizeName(target).split(' ').filter(Boolean);
  if (!qt.length || !tt.length) return 0;
  let matched = 0;
  for (const q of qt) {
    let best = 0;
    for (const t of tt) {
      const ml = Math.max(q.length, t.length);
      const sim = ml ? 1 - levenshtein(q, t) / ml : 0;
      if (sim > best) best = sim;
    }
    if (best >= 0.7) matched++;
  }
  return matched / qt.length;
}

export interface NameSuggestion<T> {
  item: T;
  score: number; // 0..1, higher = better
}

/**
 * Find best fuzzy matches by full name. Returns sorted candidates (best first).
 * Considers: exact match, substring, token-set similarity, per-token typo tolerance.
 */
export function findNameSuggestions<T extends { full_name: string }>(
  query: string,
  pool: T[],
  limit = 5,
): NameSuggestion<T>[] {
  const q = normalizeName(query);
  if (!q) return [];

  const scored: NameSuggestion<T>[] = pool.map((item) => {
    const target = normalizeName(item.full_name);
    if (!target) return { item, score: 0 };

    // Exact full match
    if (target === q) return { item, score: 1 };

    // Substring match — strong signal
    let score = 0;
    if (target.includes(q) || q.includes(target)) {
      score = Math.max(score, 0.9);
    }

    // Order-independent similarity (handles "Іван Петров" vs "Петров Іван")
    const tokenSim = tokenSetSimilarity(query, item.full_name);
    score = Math.max(score, tokenSim);

    // Per-token coverage (handles missing/extra tokens with typos)
    const coverage = tokenCoverage(query, item.full_name);
    score = Math.max(score, coverage * 0.85);

    return { item, score };
  });

  return scored
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
