export interface TalentEntryLike {
  id: string;
  team_number: number;
  title: string;
  break_needed_after: number;
  order_index: number;
}

/**
 * Builds a show running order:
 *  - spreads teams so the same team never performs twice in a row when possible
 *  - respects `break_needed_after`: how many other numbers must follow a team's act
 *    before that team can appear again (costume / prop changes)
 *  - prefers teams with the most remaining acts (classic load balancing)
 */
export function buildRunningOrder<T extends TalentEntryLike>(entries: T[]): T[] {
  const pool = [...entries];
  const result: T[] = [];
  // team -> index in result before which the team must not perform again
  const blockedUntil = new Map<number, number>();

  const remainingByTeam = () => {
    const m = new Map<number, number>();
    pool.forEach((e) => m.set(e.team_number, (m.get(e.team_number) || 0) + 1));
    return m;
  };

  while (pool.length) {
    const pos = result.length;
    const counts = remainingByTeam();
    const lastTeam = result[result.length - 1]?.team_number;

    const score = (e: T) => {
      let s = (counts.get(e.team_number) || 0) * 10; // balance load
      if (e.team_number === lastTeam) s -= 1000; // never back-to-back
      if ((blockedUntil.get(e.team_number) ?? 0) > pos) s -= 500; // respect requested break
      s -= e.order_index * 0.01; // stable tie-break on submission order
      return s;
    };

    let best = pool[0];
    let bestScore = score(pool[0]);
    for (const e of pool.slice(1)) {
      const sc = score(e);
      if (sc > bestScore) { best = e; bestScore = sc; }
    }

    pool.splice(pool.indexOf(best), 1);
    result.push(best);
    const gap = Math.max(1, best.break_needed_after || 0);
    blockedUntil.set(best.team_number, result.length + gap);
  }

  return result.map((e, i) => ({ ...e, order_index: i }));
}