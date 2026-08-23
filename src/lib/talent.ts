export interface TalentEntryLike {
  id: string;
  team_number: number;
  title: string;
  break_needed_after: number;
  order_index: number;
}

/**
 * Builds a show running order:
 *  - hard rule: the same team never performs twice in a row
 *  - hard rule (when feasible): `break_needed_after` — how many other acts must
 *    follow a team's act before that team may appear again (costume / props)
 *  - spreads each team's acts evenly across the whole show instead of clumping
 *  - keeps the biggest teams flowing so nobody is starved at the end
 *  - deterministic: equal candidates fall back to submission order
 */
export function buildRunningOrder<T extends TalentEntryLike>(entries: T[]): T[] {
  const pool = [...entries].sort((a, b) => a.order_index - b.order_index);
  const total = pool.length;
  const result: T[] = [];
  /** team -> result index before which the team must not perform again */
  const blockedUntil = new Map<number, number>();
  /** team -> index of its last placed act (for even spreading) */
  const lastSeen = new Map<number, number>();

  const remainingByTeam = () => {
    const m = new Map<number, number>();
    pool.forEach((e) => m.set(e.team_number, (m.get(e.team_number) || 0) + 1));
    return m;
  };

  while (pool.length) {
    const pos = result.length;
    const slotsLeft = total - pos;
    const counts = remainingByTeam();
    const lastTeam = result[result.length - 1]?.team_number;

    const score = (e: T) => {
      const remaining = counts.get(e.team_number) || 0;
      let s = 0;

      // Hard constraints first (large penalties keep them effectively inviolable).
      if (e.team_number === lastTeam) s -= 100000;
      const blocked = (blockedUntil.get(e.team_number) ?? 0) - pos;
      if (blocked > 0) s -= 10000 + blocked * 100;

      // Urgency: a team that still has many acts but few slots left must go now.
      s += (remaining / Math.max(1, slotsLeft)) * 1200;

      // Even spreading: reward teams that have been off-stage the longest.
      const since = pos - (lastSeen.get(e.team_number) ?? -Math.max(2, total));
      s += Math.min(since, total) * 25;

      // Heavy-setup acts are better placed early, while the show has slack.
      s += (e.break_needed_after || 0) * (slotsLeft > total / 2 ? 8 : -8);

      // Stable tie-break on submission order.
      s -= e.order_index * 0.01;
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
    lastSeen.set(best.team_number, result.length - 1);
    const gap = Math.max(1, best.break_needed_after || 0);
    blockedUntil.set(best.team_number, result.length + gap);
  }

  return result.map((e, i) => ({ ...e, order_index: i }));
}
