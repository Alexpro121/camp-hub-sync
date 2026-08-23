import { admin, corsHeaders, issueSession, json } from '../_shared/accounts.ts';
import { clientKey, peek, recordFailure, resetFailures, sleep } from '../_shared/ratelimit.ts';

/* ---------- name matching (mirrors src/lib/normalize.ts) ---------- */
function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  // `ь`/`ъ` before a iotated vowel is treated as an apostrophe: Лукьянов === Лук'янов.
  return s
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/[`ʼ'\u2018\u2019\u02BC]/g, "'")
    .replace(/[ьъ](?=[яюєїe])/g, "'")
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
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
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function tokenSetSimilarity(a: string, b: string): number {
  const at = normalizeName(a).split(' ').filter(Boolean).sort();
  const bt = normalizeName(b).split(' ').filter(Boolean).sort();
  if (!at.length || !bt.length) return 0;
  const ja = at.join(' '), jb = bt.join(' ');
  const maxLen = Math.max(ja.length, jb.length);
  if (!maxLen) return 0;
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

interface Row { id: string; full_name: string; team_number: number; team_name: string | null }

/** Only reveal the first token plus initials, so the endpoint can't be used to harvest rosters. */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const [first, ...rest] = parts;
  return [first, ...rest.map((p) => `${p[0].toUpperCase()}.`)].join(' ');
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

/* ---------- active shift selection (mirrors src/lib/shift.ts) ----------
 * Parallel shifts: only live (or imminent) shifts may be logged into, so a
 * child of one shift can never claim a profile from another one.            */
function pickActiveShift(shifts: any[]): any | null {
  const live = shifts.filter((s) => !s.deleted_at);
  if (!live.length) return null;
  const t = new Date().toISOString().slice(0, 10);
  const current = live.find((s) => s.start_date <= t && t <= s.end_date);
  if (current) return current;
  const upcoming = live.filter((s) => s.start_date > t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (upcoming) return upcoming;
  return live.slice().sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'claim' ? 'claim' : 'search';
    const svc = admin();

    const { data: shifts } = await svc
      .from('shifts')
      .select('*')
      .is('deleted_at', null)
      .order('start_date', { ascending: false });
    const active = pickActiveShift(shifts || []);

    if (action === 'search') {
      const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
      const teamRaw = String(body?.team ?? '').replace(/[^\d]/g, '');
      const team = teamRaw ? parseInt(teamRaw, 10) : 0;
      if (!fullName || fullName.length < 6 || fullName.length > 120) return json({ error: 'invalid_name' }, 400);
      // Require at least two name tokens so single fragments cannot be enumerated.
      if (fullName.split(/\s+/).filter(Boolean).length < 2) return json({ error: 'invalid_name' }, 400);
      // Require the team number: narrows the searchable pool and blocks roster-wide scraping.
      if (!team || team < 1 || team > 999) return json({ error: 'invalid_team' }, 400);

      let q = svc.from('children').select('id, full_name, team_number, team_name');
      if (active?.id) q = q.eq('shift_id', active.id);
      q = q.eq('team_number', team);
      const { data, error } = await q;
      if (error) return json({ error: 'search_failed' }, 500);

      const pool = (data || []) as Row[];

      // Self-identification only: the caller must already know their own full name.
      // We never return names, teams or partial hints, so the endpoint cannot be
      // used to enumerate the roster.
      const exact = pool.find((c) => normalizeName(c.full_name) === normalizeName(fullName));
      if (exact) return json({ exact: { id: exact.id } });

      // Allow only a single near-certain match (typo tolerance) and still reveal nothing.
      const strong = pool
        .map((item) => ({ item, s: score(fullName, item.full_name) }))
        .filter((x) => x.s >= 0.92)
        .sort((a, b) => b.s - a.s);
      if (strong.length === 1) return json({ exact: { id: strong[0].item.id } });

      return json({ suggestions: [] });
    }

    // claim
    const childId = typeof body?.childId === 'string' ? body.childId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(childId)) {
      return json({ error: 'invalid_child' }, 400);
    }

    let cq = svc.from('children').select('id, shift_id').eq('id', childId);
    if (active?.id) cq = cq.eq('shift_id', active.id);
    const { data: child } = await cq.maybeSingle();
    if (!child) return json({ error: 'child_not_found' }, 404);

    await svc.from('children').update({ has_logged_in: true }).eq('id', childId);
    const session = await issueSession(`child-${childId}@ironhelp.local`, 'child', { child_id: childId });
    return json({ session });
  } catch (_e) {
    return json({ error: 'login_failed' }, 500);
  }
});
