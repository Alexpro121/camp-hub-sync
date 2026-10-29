/**
 * Розумний пошук дитини для реєстраційної стійки.
 * Терпить: порядок слів, регістр, апострофи, і/и/ї/й/е/є, помилкову розкладку
 * клавіатури, латиницю замість кирилиці, 1–2 одруківки, неповні слова.
 */
const LAYOUT_EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const LAYOUT_UA = 'йцукенгшщзхїфівапролджєячсмитьбю\'';

const LATIN: [string, string][] = [
  ['shch', 'щ'], ['sch', 'щ'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'],
  ['yu', 'ю'], ['iu', 'ю'], ['ya', 'я'], ['ia', 'я'], ['ye', 'є'], ['ie', 'є'], ['yi', 'ї'],
  ['a', 'а'], ['b', 'б'], ['v', 'в'], ['w', 'в'], ['h', 'г'], ['g', 'г'], ['d', 'д'], ['e', 'е'],
  ['z', 'з'], ['y', 'и'], ['i', 'і'], ['j', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'],
  ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['c', 'к'], ['x', 'кс'], ['q', 'к'],
];

/** Зводимо схожі звуки до одного символу, щоб «Iгор/Ігор/Игор» збігались. */
function fold(s: string): string {
  return s
    .replace(/[ʼ'’`´"]/g, '')
    .replace(/[їиіы]/g, 'і')
    .replace(/[йь]/g, '')
    .replace(/[єеэё]/g, 'е')
    .replace(/ґ/g, 'г')
    .replace(/щ/g, 'шч');
}

function translit(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const hit = LATIN.find(([lat]) => s.startsWith(lat, i));
    if (hit) { out += hit[1]; i += hit[0].length; } else { out += s[i]; i++; }
  }
  return out;
}

export function normalize(s: string): string {
  return fold((s ?? '').normalize('NFC').toLowerCase().replace(/[-–—.,]/g, ' ').replace(/\s+/g, ' ').trim());
}

/** Варіанти запиту: як є, з виправленою розкладкою, транслітерований. */
export function queryVariants(q: string): string[] {
  const low = (q ?? '').toLowerCase().trim();
  const out = new Set<string>([normalize(low)]);
  if (/[a-z]/.test(low)) {
    const layout = [...low].map((c) => { const i = LAYOUT_EN.indexOf(c); return i >= 0 ? LAYOUT_UA[i] : c; }).join('');
    out.add(normalize(layout));
    out.add(normalize(translit(low)));
  }
  return [...out].filter(Boolean);
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Наскільки одне слово запиту підходить до слова імені (0 — ніяк, 100 — точно). */
function tokenScore(q: string, w: string): number {
  if (w === q) return 100;
  if (w.startsWith(q)) return 70 + Math.round(25 * (q.length / w.length));
  if (q.length >= 3 && w.includes(q)) return 45;
  if (q.length < 3) return 0;
  const max = q.length >= 7 ? 2 : 1;
  const prefix = w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1)));
  const d = Math.min(editDistance(q, w, max), editDistance(q, prefix.slice(0, q.length), max));
  return d <= max ? 55 - d * 15 : 0;
}

export interface Indexed { words: string[]; joined: string; digits: string }

export function buildIndex(fullName: string, phone?: string | null): Indexed {
  const joined = normalize(fullName);
  return { words: joined.split(' ').filter(Boolean), joined, digits: (phone ?? '').replace(/\D/g, '') };
}

/** Оцінка імені для запиту. 0 = не показувати. */
export function scoreIndexed(idx: Indexed, query: string): number {
  const digits = query.replace(/\D/g, '');
  if (digits.length >= 4 && digits.length === query.replace(/[\s+()-]/g, '').length) {
    return idx.digits.includes(digits) ? 90 : 0;
  }
  let best = 0;
  for (const v of queryVariants(query)) {
    const qTokens = v.split(' ').filter(Boolean);
    if (!qTokens.length) continue;
    const used = new Set<number>();
    let sum = 0;
    let ok = true;
    for (const qt of qTokens) {
      let top = 0; let at = -1;
      idx.words.forEach((w, i) => {
        if (used.has(i)) return;
        const s = tokenScore(qt, w);
        if (s > top) { top = s; at = i; }
      });
      if (!top) { ok = false; break; }
      used.add(at);
      sum += top;
    }
    if (!ok) continue;
    let score = sum / qTokens.length;
    if (idx.joined.startsWith(v)) score += 8;
    score += Math.min(qTokens.length, 3) * 2;
    if (score > best) best = score;
  }
  return best;
}

export function searchItems<T>(items: T[], index: (t: T) => Indexed, query: string, limit = 40): T[] {
  const q = query.trim();
  if (!q) return [];
  const scored: { t: T; s: number }[] = [];
  for (const t of items) {
    const s = scoreIndexed(index(t), q);
    if (s > 0) scored.push({ t, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.t);
}
