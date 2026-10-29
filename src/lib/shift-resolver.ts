import type { Shift } from '@/types/app';

/** Teams come exclusively from the shift's dynamic assigned_teams array — no templates. */
export function teamsOf(s: Shift): number[] {
  return Array.isArray(s.assigned_teams) && s.assigned_teams.length ? s.assigned_teams : [];
}

export function parseTeamsInput(raw: string): number[] {
  const out = new Set<number>();
  for (const chunk of raw.split(/[,;\s]+/).filter(Boolean)) {
    const range = chunk.match(/^(\d{1,3})[-–](\d{1,3})$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
      continue;
    }
    const n = parseInt(chunk.replace(/[^\d]/g, ''), 10);
    if (n) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
