// Iron Avatar Engine — детермінована генерація піксельних аватарів 20×20
// для учасників проєкту «Залізна Зміна». Хеш FNV-1a, 32 архетипи, 5 палітр.

export const AVATAR_GRID = 20;

/** Детермінований хеш FNV-1a (32-bit) від імені. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Простий детермінований PRNG (mulberry32) від seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Фірмові палітри проєкту «Залізна Зміна». */
export const IRON_PALETTES = [
  { bg: '#0F1523', body: '#FA5A15', accent: '#FFB26B', eye: '#FFFFFF' }, // Iron Ember
  { bg: '#0B1F2A', body: '#22C55E', accent: '#A7F3D0', eye: '#FFFFFF' }, // Forest Steel
  { bg: '#141126', body: '#8B5CF6', accent: '#DDD6FE', eye: '#FFFFFF' }, // Night Violet
  { bg: '#231006', body: '#F59E0B', accent: '#FDE68A', eye: '#1F2937' }, // Amber Rail
  { bg: '#0A1B2E', body: '#38BDF8', accent: '#BAE6FD', eye: '#0F172A' }, // Sky Coupler
] as const;

export interface IronAvatarData {
  seed: number;
  archetype: number;      // 0..31
  paletteIndex: number;   // 0..4
  /** Симетрична маска пікселів тіла (true = заповнений). */
  mask: boolean[];
  blinkPeriodMs: number;
}

/** Генерація детермінованих даних аватара за ім'ям. */
export function generateIronAvatar(name: string): IronAvatarData {
  const normalized = (name || 'Учасник').trim().toLowerCase();
  const seed = fnv1a(normalized);
  const rnd = mulberry32(seed);
  const archetype = seed % 32;
  const paletteIndex = Math.floor(rnd() * IRON_PALETTES.length);

  // Симетрична половина сітки 20×20 → дзеркалимо по вертикалі.
  const mask: boolean[] = new Array(AVATAR_GRID * AVATAR_GRID).fill(false);
  const half = Math.ceil(AVATAR_GRID / 2);
  const density = 0.55 + rnd() * 0.2;
  const cx = half - 1;

  for (let y = 0; y < AVATAR_GRID; y++) {
    // Форма тіла залежить від архетипу: ширина змінюється з висотою.
    const t = y / (AVATAR_GRID - 1);
    let halfWidth: number;
    switch (archetype % 4) {
      case 0: halfWidth = Math.round(3 + 6 * Math.sin(t * Math.PI)); break;        // круглий
      case 1: halfWidth = Math.round(9 - 5 * t); break;                              // конус
      case 2: halfWidth = Math.round(4 + 5 * t); break;                              // гантеля догори
      default: halfWidth = Math.round(6 + 3 * Math.cos(t * Math.PI * 2)); break;     // хвиля
    }
    const topTrim = archetype % 8 >= 4 ? 2 : 3; // виріз зверху для деяких архетипів
    for (let x = 0; x < half; x++) {
      const dx = Math.abs(x - cx);
      const inShape = y >= topTrim && dx <= halfWidth && rnd() < density;
      if (inShape) {
        mask[y * AVATAR_GRID + x] = true;
        const mx = AVATAR_GRID - 1 - x;
        if (mx !== x) mask[y * AVATAR_GRID + mx] = true;
      }
    }
  }

  // Очі: гарантовано білі пікселі на симетричних позиціях.
  const eyeY = 6 + (archetype % 3);
  const eyeDX = 2 + (Math.floor(archetype / 3) % 3);
  const setEye = (x: number, y: number) => { mask[y * AVATAR_GRID + x] = true; };
  setEye(cx - eyeDX, eyeY); setEye(cx + 1 + eyeDX, eyeY);

  return {
    seed,
    archetype,
    paletteIndex,
    mask,
    blinkPeriodMs: 2800 + (seed % 2600),
  };
}

export interface RenderAvatarOptions {
  /** Якщо true — очі заплющені (горизонтальні риски). */
  blinking?: boolean;
  /** Масштаб пікселя; якщо не задано — підганяється під розмір canvas. */
  pixelSize?: number;
}

/** Малювання аватара на HTML5 Canvas. */
export function renderAvatarToCanvas(
  canvas: HTMLCanvasElement,
  data: IronAvatarData,
  opts: RenderAvatarOptions = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = Math.min(canvas.width, canvas.height);
  const px = opts.pixelSize ?? Math.floor(size / AVATAR_GRID);
  const offX = Math.floor((canvas.width - px * AVATAR_GRID) / 2);
  const offY = Math.floor((canvas.height - px * AVATAR_GRID) / 2);
  const palette = IRON_PALETTES[data.paletteIndex];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const half = Math.ceil(AVATAR_GRID / 2);
  const cx = half - 1;
  const eyeY = 6 + (data.archetype % 3);
  const eyeDX = 2 + (Math.floor(data.archetype / 3) % 3);
  const eyes = new Set<number>([
    eyeY * AVATAR_GRID + (cx - eyeDX),
    eyeY * AVATAR_GRID + (cx + 1 + eyeDX),
  ]);

  for (let y = 0; y < AVATAR_GRID; y++) {
    for (let x = 0; x < AVATAR_GRID; x++) {
      const i = y * AVATAR_GRID + x;
      if (!data.mask[i]) continue;
      const isEye = eyes.has(i);
      if (isEye) {
        if (opts.blinking) {
          // Заплющене око — акцентна риска.
          ctx.fillStyle = palette.accent;
          ctx.fillRect(offX + x * px, offY + y * px + Math.floor(px * 0.4), px, Math.max(1, Math.floor(px * 0.2)));
        } else {
          ctx.fillStyle = palette.eye;
          ctx.fillRect(offX + x * px, offY + y * px, px, px);
        }
        continue;
      }
      // Акцентні пікселі для текстури.
      const accent = fnv1a(`${data.seed}:${x}:${y}`) % 7 === 0;
      ctx.fillStyle = accent ? palette.accent : palette.body;
      ctx.fillRect(offX + x * px, offY + y * px, px, px);
    }
  }
}
