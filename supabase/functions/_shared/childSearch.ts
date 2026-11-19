/**
 * Пошук дитини за ПІБ у межах однієї команди для Telegram-бота.
 * Правила збігу ті самі, що в child-login (там вони лишаються без змін):
 * точний збіг, або єдиний майже точний, або єдиний частковий; списки імен не повертаються.
 * Без імпортів, тож тести завантажують модуль напряму.
 */

export function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/[`ʼ'‘’ʼ]/g, "'")
    .replace(/[ьъ](?=[яюєїе])/g, "'")
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const n = b.length;
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = Array.from({ length: n + 1 }, () => 0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function tokenSetSimilarity(a: string, b: string): number {
  const ja = normalizeName(a).split(' ').filter(Boolean).sort().join(' ');
  const jb = normalizeName(b).split(' ').filter(Boolean).sort().join(' ');
  const maxLen = Math.max(ja.length, jb.length);
  if (!ja || !jb || !maxLen) return 0;
  return 1 - levenshtein(ja, jb) / maxLen;
}

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

function score(query: string, name: string): number {
  const q = normalizeName(query);
  const target = normalizeName(name);
  if (!q || !target) return 0;
  if (target === q) return 1;
  let s = 0;
  if (target.includes(q) || q.includes(target)) s = 0.9;
  s = Math.max(s, tokenSetSimilarity(query, name));
  s = Math.max(s, tokenCoverage(query, name) * 0.85);
  return s;
}

export interface ChildRow { id: string; full_name: string; team_number: number; shift_id: string | null }

export type MatchResult<T> = { kind: 'one'; row: T } | { kind: 'ambiguous' } | { kind: 'none' };

export function matchChild<T extends { full_name: string }>(pool: T[], fullName: string): MatchResult<T> {
  const query = fullName.trim();
  if (query.length < 2 || query.length > 120) return { kind: 'none' };
  const exact = pool.filter((c) => normalizeName(c.full_name) === normalizeName(query));
  if (exact.length === 1) return { kind: 'one', row: exact[0] };
  if (exact.length > 1) return { kind: 'ambiguous' };
  // Одне слово: лише точний збіг, щоб не можна було перебирати список.
  if (query.split(/\s+/).filter(Boolean).length < 2) return { kind: 'none' };

  const scored = pool
    .map((row) => ({ row, s: score(query, row.full_name), cov: tokenCoverage(query, row.full_name) }))
    .sort((a, b) => b.s - a.s);
  const strong = scored.filter((x) => x.s >= 0.92);
  if (strong.length === 1) return { kind: 'one', row: strong[0].row };
  const soft = scored.filter((x) => x.cov >= 0.65 && x.s >= 0.7);
  if (soft.length === 1) return { kind: 'one', row: soft[0].row };
  return { kind: 'none' };
}

interface ShiftRow { id: string; start_date: string; end_date: string; deleted_at?: string | null }

/**
 * Зміни, у які зараз можна входити (так само, як у child-login): ті, що йдуть сьогодні
 * або починаються протягом трьох днів; інакше одна найближча/остання.
 */
export function liveShiftIds(shifts: ShiftRow[], today: string, soon: string): string[] {
  const live = shifts.filter((s) => !s.deleted_at);
  const now = live.filter((s) => s.start_date <= soon && today <= s.end_date).map((s) => s.id);
  if (now.length) return now;
  const current = live.find((s) => s.start_date <= today && today <= s.end_date);
  if (current) return [current.id];
  const upcoming = live.filter((s) => s.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (upcoming) return [upcoming.id];
  const last = live.slice().sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
  return last ? [last.id] : [];
}
