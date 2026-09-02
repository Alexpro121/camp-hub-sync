/**
 * IRON AVATAR ENGINE v4.0 (Production Ultra Edition)
 * Всеукраїнський проєкт «Залізна Зміна»
 * 
 * Детермінований генератор 32-х авторських 8-bit персонажів на матриці 20×20.
 * Завжди генерує однакового героя, палітру та характеристики для одного й того самого ПІБ.
 */

export const AVATAR_GRID = 20;

export interface Archetype {
  id: string;
  name: string;
  title: string;
  power: string;
  artifact: string;
  badgeEmoji: string;
}

export interface Palette {
  id: string;
  name: string;
  skin: string;
  skinShade: string;
  mainColor: string;
  secondColor: string;
  darkColor: string;
  eyeColor: string;
  bloom: string;
  affinity: string;
}

export interface AvatarStats {
  leadership: number;  // 70..100
  creativity: number;  // 70..100
  tech: number;        // 70..100
  speed: number;       // 70..100
  teamwork: number;    // 70..100
}

export interface IronAvatarData {
  name: string;
  normalizedName: string;
  seed: number;
  archetype: Archetype;
  palette: Palette;
  paletteIndex: number;
  matrix: number[][];
  size: number;
  stats: AvatarStats;
  blinkPeriodMs: number;
}

// 1. БАЗА 32-Х КАРДИНАЛЬНО РІЗНИХ КАЗКОВИХ АРХЕТИПІВ
export const HERO_ARCHETYPES: Archetype[] = [
  { id: "pirate", name: "Кібер-Пірат", title: "🏴‍☠️ КІБЕР-ПІРАТ МАГІСТРАЛЕЙ", power: "🗺️ Пошук Скарбів", artifact: "⚓️ Золотий Якір", badgeEmoji: "🏴‍☠️" },
  { id: "dino", name: "Динозаврик", title: "🦕 ДРАКОНЧИК ІННОВАЦІЙ", power: "🔥 Залізне Полум'я", artifact: "🦖 Смарагдовий Шип", badgeEmoji: "🦕" },
  { id: "astro", name: "Астронавт", title: "🚀 КОСМОНАВТ «ЗАЛІЗНОЇ ЗМІНИ»", power: "🌌 Невагомість", artifact: "🪐 Квантовий Шолом", badgeEmoji: "🚀" },
  { id: "wizard", name: "Кібер-Маг", title: "🧙‍♂️ ЧАРІВНИК МАЙБУТНЬОГО", power: "✨ Магія Ідей", artifact: "🔮 Зоряний Кристал", badgeEmoji: "🧙‍♂️" },
  { id: "cat", name: "Неонове Кошеня", title: "🐱 НЕОНОВИЙ КІТ-ШТУРМАН", power: "⚡️ Супер-Швидкість", artifact: "🔔 Сяючий Дзвіночок", badgeEmoji: "🐱" },
  { id: "ninja", name: "Тіньовий Ніндзя", title: "🥷 НІНДЗЯ ЗАЛІЗНИХ МАГІСТРАЛЕЙ", power: "💨 Невидимість", artifact: "🗡️ Неоновий Сюрикен", badgeEmoji: "🥷" },
  { id: "robot", name: "Ретро-Андроїд", title: "🤖 ДОБРИЙ КІБЕР-БОТ", power: "🧠 Штучний Інтелект", artifact: "⚡️ Лазерне Серце", badgeEmoji: "🤖" },
  { id: "crown", name: "Королівський Лідер", title: "👑 КОРОЛІВСЬКИЙ ЧЕМПІОН", power: "🌟 Лідерство 100%", artifact: "💎 Рубінова Корона", badgeEmoji: "👑" },
  { id: "teddy", name: "Ведмедик Тедді", title: "🐻 ВЕДМЕДИК-ВИНАХІДНИК", power: "🍯 Затишок і Сила", artifact: "🧸 Медовий Значок", badgeEmoji: "🐻" },
  { id: "gamer", name: "Кіберспортсмен", title: "🎧 ПРО-ГЕЙМЕР ПРОЄКТУ", power: "🎮 Реакція 999 FPS", artifact: "🕹️ RGB-Навушники", badgeEmoji: "🎧" },
  { id: "hero", name: "Супергерой", title: "🦸 СУПЕРГЕРОЙ ЗМІН", power: "💥 Незламна Воля", artifact: "⚡️ Шеврон Світла", badgeEmoji: "🦸" },
  { id: "fox", name: "Хитрий Лис", title: "🦊 ЛИСИЧКА-СТРАТЕГ", power: "🎯 Кмітливість", artifact: "🍃 Чарівний Хвостик", badgeEmoji: "🦊" },
  { id: "artist", name: "Арт-Геній", title: "🎨 ХУДОЖНИК МАЙБУТНЬОГО", power: "🌈 Творчий Вибух", artifact: "🖌️ Золотий Пензель", badgeEmoji: "🎨" },
  { id: "scientist", name: "Божевільний Вчений", title: "🥽 ПРОФЕСОР ІННОВАЦІЙ", power: "💡 Еврика!", artifact: "🧪 Плазмова Колба", badgeEmoji: "🥽" },
  { id: "unicorn", name: "Казковий Єдиноріг", title: "🦄 ЗОРЯНИЙ ЄДИНОРІГ", power: "✨ Сяйво Райдуги", artifact: "🌟 Золотий Ріг", badgeEmoji: "🦄" },
  { id: "frog", name: "Жабка-Детектив", title: "🐸 ВЕСЕЛА ЖАБКА", power: "🌊 Водний Стрибок", artifact: "🍀 Листок Удачі", badgeEmoji: "🐸" },
  { id: "detective", name: "Детектив Поїзда", title: "🕵️‍♂️ ШЕРЛОК МАГІСТРАЛЕЙ", power: "🔍 Дедукція", artifact: "🔎 Голографічна Лупа", badgeEmoji: "🕵️‍♂️" },
  { id: "rockstar", name: "Рок-Музикант", title: "🎸 РОК-ЗІРКА ДРАЙВУ", power: "🔊 Звуковий Шок", artifact: "⚡️ Медіатор Сонця", badgeEmoji: "🎸" },
  { id: "diver", name: "Акванавт", title: "🤿 ГЛИБОКОВОДНИЙ ДОСЛІДНИК", power: "🫧 Океанський Подих", artifact: "🐚 Перлина Глибин", badgeEmoji: "🤿" },
  { id: "knight", name: "Залізний Лицар", title: "⚔️ ЛИЦАР «ЗАЛІЗНОЇ ЗМІНИ»", power: "🛡️ Абсолютний Захист", artifact: "🗡️ Сталевий Меч", badgeEmoji: "⚔️" },
  { id: "fairy", name: "Лісова Фея", title: "🌸 КВІТКОВА ФЕЯ", power: "🌿 Сила Природи", artifact: "🌺 Квітковий Вінок", badgeEmoji: "🌸" },
  { id: "bee", name: "Бджілка-Трудар", title: "🐝 БДЖІЛКА ІННОВАЦІЙ", power: "⚡️ Працьовитість", artifact: "🍯 Золотий Нектар", badgeEmoji: "🐝" },
  { id: "panda", name: "Пандочка", title: "🐼 МУДРА ПАНДА", power: "🥋 Кунг-Фу Спокій", artifact: "🎋 Бамбуковий Пагін", badgeEmoji: "🐼" },
  { id: "lightning", name: "Повелитель Струму", title: "⚡️ ПОВЕЛИТЕЛЬ ВОЛЬТІВ", power: "🔋 1000 Вольт", artifact: "⚡️ Блискавка Сонця", badgeEmoji: "⚡️" },
  { id: "racer", name: "Гонщик Поїзда", title: "🏎️ ПІЛОТ ШВИДКОСТІ", power: "🏁 500 км/год", artifact: "🏆 Кубок Чемпіона", badgeEmoji: "🏎️" },
  { id: "penguin", name: "Пінгвінчик", title: "🐧 ПОЛЯРНИЙ ПІНГВІН", power: "❄️ Морозна Сила", artifact: "🐟 Крижана Зірка", badgeEmoji: "🐧" },
  { id: "karate", name: "Майстер Єдиноборств", title: "🥋 МАЙСТЕР БОЙОВИХ МИСТЕЦТВ", power: "🥋 Чорний Пояс", artifact: "🔴 Пов'язка Сонця", badgeEmoji: "🥋" },
  { id: "bunny", name: "Сяючий Зайчик", title: "🥕 СОНЯЧИЙ ЗАЙЧИК", power: "🐰 Супер-Стрибок", artifact: "🥕 Золота Морквинка", badgeEmoji: "🥕" },
  { id: "alien", name: "Дружній Прибулець", title: "🛸 ГІСТЬ З ГАЛАКТИКИ", power: "🌌 Телекінез", artifact: "🛸 Літаюча Тарілка", badgeEmoji: "🛸" },
  { id: "pumpkin", name: "Гарбузовий Герой", title: "🎃 ГАРБУЗОВИЙ ВАРТОВИЙ", power: "🔥 Вогняний Сміх", artifact: "🕯️ Вічний Вогник", badgeEmoji: "🎃" },
  { id: "train_chef", name: "Шеф-Машиніст", title: "🚂 ГОЛОВНИЙ МАШИНІСТ", power: "🚄 Тяга 100 000 к.с.", artifact: "🧢 Кашкетка №1", badgeEmoji: "🚂" },
  { id: "angel", name: "Крилата Мрія", title: "🕊️ КРИЛАТИЙ МРІЙНИК", power: "🪽 Політ Натхнення", artifact: "✨ Німб Світла", badgeEmoji: "🕊️" }
];

export const ARCHETYPES = HERO_ARCHETYPES;

// 2. ДЕТЕРМІНОВАНІ ПАЛІТРИ (12 АВТОРСЬКИХ ГАРМОНІЙНИХ СХЕМ)
export const BRIGHT_PALETTES: Palette[] = [
  {
    id: "flame",
    name: "Залізне Полум'я",
    skin: "#FFDFBA",
    skinShade: "#F5BA8E",
    mainColor: "#FA5A15",
    secondColor: "#FFB800",
    darkColor: "#1E293B",
    eyeColor: "#00F0FF",
    bloom: "rgba(250, 90, 21, 0.45)",
    affinity: "🔥 Залізне Полум'я"
  },
  {
    id: "emerald",
    name: "Смарагдовий Неон",
    skin: "#FFE5C8",
    skinShade: "#E5A876",
    mainColor: "#00E676",
    secondColor: "#FA5A15",
    darkColor: "#0F2E1E",
    eyeColor: "#FFD000",
    bloom: "rgba(0, 230, 118, 0.4)",
    affinity: "🌱 Смарагдова Енергія"
  },
  {
    id: "cosmic",
    name: "Космічний Ультрафіолет",
    skin: "#FCE0D2",
    skinShade: "#DC9E8C",
    mainColor: "#A855F7",
    secondColor: "#FF4081",
    darkColor: "#1F1135",
    eyeColor: "#00F0FF",
    bloom: "rgba(168, 85, 247, 0.45)",
    affinity: "🔮 Космічний Промінь"
  },
  {
    id: "azure",
    name: "Лазурна Блискавка",
    skin: "#FFD8B3",
    skinShade: "#D99564",
    mainColor: "#00F0FF",
    secondColor: "#FA5A15",
    darkColor: "#092233",
    eyeColor: "#FFD000",
    bloom: "rgba(0, 240, 255, 0.45)",
    affinity: "⚡️ Лазурна Блискавка"
  },
  {
    id: "solar",
    name: "Сонячний Бурштин",
    skin: "#FFE0C0",
    skinShade: "#E29D68",
    mainColor: "#FFB800",
    secondColor: "#FF4081",
    darkColor: "#2A1800",
    eyeColor: "#00E676",
    bloom: "rgba(255, 184, 0, 0.45)",
    affinity: "☀️ Сонячне Тепло"
  },
  {
    id: "forest",
    name: "Карпатська Смерека",
    skin: "#FFE2CA",
    skinShade: "#DFA075",
    mainColor: "#10B981",
    secondColor: "#3B82F6",
    darkColor: "#064E3B",
    eyeColor: "#F59E0B",
    bloom: "rgba(16, 185, 129, 0.45)",
    affinity: "🌲 Сила Карпат"
  },
  {
    id: "sakura",
    name: "Неонова Сакура",
    skin: "#FFF0E6",
    skinShade: "#F5C2AF",
    mainColor: "#EC4899",
    secondColor: "#8B5CF6",
    darkColor: "#4A044E",
    eyeColor: "#38BDF8",
    bloom: "rgba(236, 72, 153, 0.45)",
    affinity: "🌸 Квітуча Мрія"
  },
  {
    id: "cyberpunk",
    name: "Кіберпанк 2077",
    skin: "#FCE7F3",
    skinShade: "#F472B6",
    mainColor: "#F43F5E",
    secondColor: "#06B6D4",
    darkColor: "#18181B",
    eyeColor: "#FACC15",
    bloom: "rgba(244, 63, 94, 0.45)",
    affinity: "💾 Цифровий Код"
  },
  {
    id: "arctic",
    name: "Арктичний Лід",
    skin: "#F0F9FF",
    skinShade: "#BAE6FD",
    mainColor: "#0284C7",
    secondColor: "#38BDF8",
    darkColor: "#0C4A6E",
    eyeColor: "#F43F5E",
    bloom: "rgba(56, 189, 248, 0.45)",
    affinity: "❄️ Крижана Витримка"
  },
  {
    id: "steampunk",
    name: "Залізна Мідь",
    skin: "#FEE2E2",
    skinShade: "#FCA5A5",
    mainColor: "#B45309",
    secondColor: "#D97706",
    darkColor: "#451A03",
    eyeColor: "#10B981",
    bloom: "rgba(180, 83, 9, 0.45)",
    affinity: "⚙️ Залізний Механізм"
  },
  {
    id: "aurora",
    name: "Північне Сяйво",
    skin: "#F5F3FF",
    skinShade: "#DDD6FE",
    mainColor: "#6366F1",
    secondColor: "#14B8A6",
    darkColor: "#1E1B4B",
    eyeColor: "#FB7185",
    bloom: "rgba(99, 102, 241, 0.45)",
    affinity: "🌌 Магічне Сяйво"
  },
  {
    id: "obsidian",
    name: "Нічний Обсидіан",
    skin: "#FEEBC8",
    skinShade: "#FBD38D",
    mainColor: "#334155",
    secondColor: "#FA5A15",
    darkColor: "#020617",
    eyeColor: "#38BDF8",
    bloom: "rgba(250, 90, 21, 0.5)",
    affinity: "🛡️ Незламна Варта"
  }
];

export const IRON_PALETTES = BRIGHT_PALETTES;

// 3. ХЕШУВАННЯ ТА PRNG З УКРАЇНСЬКОЮ НОРМАЛІЗАЦІЄЮ
export function normalizeAvatarName(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[`’ʼʻ"']/g, "'")
    .replace(/[\s\t\n]+/g, ' ')
    .trim();
}

export function fnv1a(str: string): number {
  const s = normalizeAvatarName(str) || "залізна зміна";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const hashString32 = fnv1a;

function createPRNG(seed: number) {
  let s = seed >>> 0;
  return function() {
    let t = (s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 4. ТАБЛИЦЯ КОЛЬОРІВ ПІКСЕЛІВ
export function getPixelColor(val: number, pal: Palette): string | null {
  switch (val) {
    case 1: return pal.skin;
    case 2: return pal.skinShade;
    case 3: return pal.mainColor;
    case 4: return pal.secondColor;
    case 5: return pal.darkColor;
    case 6: return '#FFFFFF';
    case 7: return pal.eyeColor;
    case 8: return '#FFFFFF';
    case 9: return '#1E293B';
    case 10: return '#FF4081';
    case 11: return '#FA5A15';
    case 12: return '#FFD000';
    case 13: return '#FFFFFF';
    case 14: return '#E11D48';
    case 15: return '#00F0FF';
    default: return null;
  }
}

export const getPixelHex = getPixelColor;

// 5. ГЕНЕРАЦІЯ 20×20 МАТРИЦІ З 32 ОКРЕМИМИ ОБРАЗАМИ ТА ХАРАКТЕРИСТИКАМИ
export function generateIronAvatar(name: string): IronAvatarData {
  const norm = normalizeAvatarName(name);
  const seed = fnv1a(norm || "залізна зміна");
  const rng = createPRNG(seed);

  const archetypeIndex = seed % HERO_ARCHETYPES.length;
  const archetype = HERO_ARCHETYPES[archetypeIndex];
  const paletteIndex = Math.floor(rng() * BRIGHT_PALETTES.length);
  const palette = BRIGHT_PALETTES[paletteIndex];

  const N = 20;
  const matrix: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  const aid = archetype.id;

  // Базовий одяг / плечі
  for (let r = 15; r <= 19; r++) {
    for (let c = 3; c <= 16; c++) matrix[r][c] = 3;
  }
  matrix[16][3] = 4; matrix[17][3] = 4; matrix[18][3] = 4;
  matrix[16][16] = 4; matrix[17][16] = 4; matrix[18][16] = 4;
  // Фірмовий шеврон «Залізна Зміна» на грудях
  matrix[16][9] = 11; matrix[16][10] = 11;
  matrix[17][9] = 12; matrix[17][10] = 12;

  // Базове обличчя
  for (let r = 6; r <= 14; r++) {
    for (let c = 4; c <= 15; c++) {
      if ((r === 6 || r === 14) && (c <= 5 || c >= 14)) continue;
      matrix[r][c] = (r === 14 || c === 4 || c === 15) ? 2 : 1;
    }
  }

  // Індивідуальні деталі архетипів
  switch (aid) {
    case "pirate":
      // Піратський капелюх з черепом
      for (let c = 2; c <= 17; c++) matrix[5][c] = 5;
      for (let r = 2; r <= 4; r++) for (let c = 4; c <= 15; c++) matrix[r][c] = 5;
      matrix[1][3] = 5; matrix[1][16] = 5;
      matrix[3][9] = 13; matrix[3][10] = 13; matrix[4][9] = 11;
      // Ремінець пов'язки на праве око
      matrix[7][10] = 5; matrix[6][11] = 5; matrix[7][14] = 5; matrix[8][15] = 5;
      // Шкіряна піратська пов'язка 3x3
      for (let r = 7; r <= 9; r++) for (let c = 11; c <= 13; c++) matrix[r][c] = 5;
      matrix[8][12] = 12; // Золота емблема по центру пов'язки
      break;

    case "dino":
      for (let r = 3; r <= 8; r++) for (let c = 3; c <= 16; c++) matrix[r][c] = 3;
      matrix[0][9] = 11; matrix[0][10] = 11;
      matrix[1][9] = 11; matrix[1][10] = 11;
      matrix[4][9] = 11; matrix[4][10] = 11;
      matrix[6][6] = 13; matrix[6][13] = 13;
      break;

    case "astro":
      for (let r = 2; r <= 6; r++) for (let c = 3; c <= 16; c++) matrix[r][c] = 13;
      for (let c = 5; c <= 14; c++) matrix[6][c] = 11;
      matrix[0][9] = 11; matrix[1][9] = 13;
      break;

    case "wizard":
      matrix[0][9] = 3; matrix[0][10] = 3;
      matrix[1][8] = 3; matrix[1][11] = 3;
      matrix[2][7] = 3; matrix[2][12] = 3;
      for (let r = 3; r <= 5; r++) for (let c = 5; c <= 14; c++) matrix[r][c] = 3;
      for (let c = 2; c <= 17; c++) matrix[5][c] = 4;
      matrix[3][9] = 12; matrix[4][10] = 12;
      break;

    case "cat":
      for (let c = 4; c <= 15; c++) matrix[4][c] = 3;
      matrix[2][3] = 3; matrix[2][4] = 3; matrix[3][4] = 10;
      matrix[2][15] = 3; matrix[2][16] = 3; matrix[3][15] = 10;
      matrix[12][5] = 5; matrix[12][14] = 5;
      break;

    case "ninja":
      for (let c = 3; c <= 16; c++) matrix[5][c] = 5;
      matrix[5][9] = 12; matrix[5][10] = 12;
      for (let r = 11; r <= 14; r++) for (let c = 5; c <= 14; c++) matrix[r][c] = 5;
      break;

    case "robot":
      for (let r = 3; r <= 14; r++) for (let c = 3; c <= 16; c++) matrix[r][c] = 5;
      for (let r = 6; r <= 12; r++) for (let c = 5; c <= 14; c++) matrix[r][c] = 7;
      matrix[1][9] = 11; matrix[2][9] = 11;
      break;

    case "crown":
      for (let c = 4; c <= 15; c++) matrix[5][c] = 12;
      matrix[2][4] = 12; matrix[2][9] = 12; matrix[2][10] = 12; matrix[2][15] = 12;
      matrix[3][4] = 11; matrix[3][9] = 11; matrix[3][15] = 11;
      for (let c = 4; c <= 15; c++) matrix[6][c] = 3;
      break;

    case "teddy":
      matrix[2][3] = 4; matrix[2][4] = 4; matrix[3][3] = 4;
      matrix[2][15] = 4; matrix[2][16] = 4; matrix[3][16] = 4;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 3;
      matrix[11][9] = 5; matrix[11][10] = 5;
      break;

    case "gamer":
      for (let c = 5; c <= 14; c++) matrix[3][c] = 11;
      matrix[6][2] = 11; matrix[7][2] = 11; matrix[8][2] = 15;
      matrix[6][17] = 11; matrix[7][17] = 11; matrix[8][17] = 15;
      matrix[9][16] = 12; matrix[9][15] = 12;
      break;

    case "hero":
      for (let c = 4; c <= 15; c++) matrix[5][c] = 3;
      matrix[8][5] = 5; matrix[8][6] = 5; matrix[8][13] = 5; matrix[8][14] = 5;
      break;

    case "fox":
      matrix[1][3] = 11; matrix[2][3] = 11; matrix[2][4] = 13;
      matrix[1][16] = 11; matrix[2][16] = 11; matrix[2][15] = 13;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 11;
      break;

    case "artist":
      for (let c = 3; c <= 16; c++) matrix[4][c] = 4;
      matrix[3][14] = 4; matrix[2][13] = 4;
      matrix[11][4] = 15; matrix[12][15] = 12;
      break;

    case "scientist":
      matrix[1][5] = 13; matrix[0][6] = 13; matrix[0][13] = 13; matrix[1][14] = 13;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 13;
      matrix[6][6] = 12; matrix[6][7] = 12; matrix[6][12] = 12; matrix[6][13] = 12;
      break;

    case "unicorn":
      matrix[0][9] = 12; matrix[1][9] = 12; matrix[2][9] = 12;
      matrix[3][8] = 4; matrix[3][9] = 15; matrix[3][10] = 4;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 13;
      break;

    case "frog":
      matrix[2][4] = 3; matrix[2][5] = 3; matrix[3][4] = 13; matrix[3][5] = 5;
      matrix[2][14] = 3; matrix[2][15] = 3; matrix[3][14] = 13; matrix[3][15] = 5;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 3;
      break;

    case "detective":
      for (let c = 4; c <= 15; c++) matrix[3][c] = 4;
      for (let c = 2; c <= 17; c++) matrix[4][c] = 4;
      break;

    case "rockstar":
      matrix[1][5] = 11; matrix[0][8] = 11; matrix[0][11] = 11; matrix[1][14] = 11;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 11;
      matrix[10][6] = 11; matrix[11][6] = 12;
      break;

    case "diver":
      for (let c = 4; c <= 15; c++) matrix[4][c] = 12;
      matrix[7][16] = 12; matrix[8][16] = 12; matrix[6][16] = 11;
      break;

    case "knight":
      for (let r = 2; r <= 5; r++) for (let c = 4; c <= 15; c++) matrix[r][c] = 5;
      matrix[0][9] = 11; matrix[1][9] = 11;
      matrix[5][7] = 13; matrix[5][12] = 13;
      break;

    case "fairy":
      for (let c = 4; c <= 15; c++) matrix[4][c] = 3;
      matrix[4][5] = 10; matrix[4][8] = 12; matrix[4][11] = 10; matrix[4][14] = 12;
      matrix[8][3] = 1; matrix[8][16] = 1;
      break;

    case "bee":
      matrix[1][7] = 5; matrix[0][6] = 12;
      matrix[1][12] = 5; matrix[0][13] = 12;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 12;
      break;

    case "panda":
      matrix[2][3] = 5; matrix[2][4] = 5; matrix[3][3] = 5;
      matrix[2][15] = 5; matrix[2][16] = 5; matrix[3][16] = 5;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 13;
      matrix[8][6] = 5; matrix[8][7] = 5; matrix[8][12] = 5; matrix[8][13] = 5;
      break;

    case "lightning":
      matrix[0][5] = 12; matrix[1][7] = 12; matrix[0][11] = 12; matrix[1][13] = 12;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 12;
      break;

    case "racer":
      for (let r = 2; r <= 5; r++) for (let c = 4; c <= 15; c++) matrix[r][c] = 4;
      matrix[2][9] = 13; matrix[2][10] = 13; matrix[3][9] = 13; matrix[3][10] = 13;
      break;

    case "penguin":
      for (let c = 4; c <= 15; c++) matrix[4][c] = 5;
      matrix[6][9] = 11; matrix[6][10] = 11;
      break;

    case "karate":
      for (let c = 4; c <= 15; c++) matrix[5][c] = 13;
      matrix[5][9] = 4; matrix[5][10] = 4;
      break;

    case "bunny":
      matrix[0][5] = 13; matrix[1][5] = 10; matrix[2][5] = 13;
      matrix[0][14] = 13; matrix[1][14] = 10; matrix[2][14] = 13;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 13;
      break;

    case "alien":
      matrix[1][9] = 3; matrix[0][9] = 15;
      for (let r = 6; r <= 14; r++) for (let c = 4; c <= 15; c++) if (matrix[r][c] === 1) matrix[r][c] = 3;
      matrix[6][9] = 6; matrix[6][10] = 7; // Третє кібер-око
      break;

    case "pumpkin":
      matrix[1][9] = 3; matrix[2][9] = 3;
      for (let r = 3; r <= 6; r++) for (let c = 4; c <= 15; c++) matrix[r][c] = 11;
      break;

    case "train_chef":
      for (let c = 4; c <= 15; c++) matrix[3][c] = 5;
      for (let c = 3; c <= 16; c++) matrix[4][c] = 11;
      matrix[3][9] = 12; matrix[3][10] = 12;
      for (let c = 2; c <= 17; c++) matrix[5][c] = 5;
      break;

    case "angel":
      matrix[1][7] = 12; matrix[1][8] = 12; matrix[1][11] = 12; matrix[1][12] = 12;
      for (let c = 4; c <= 15; c++) matrix[4][c] = 13;
      break;
  }

  // ОЧІ ТА МІМІКА ОБЛИЧЧЯ
  if (aid !== "robot") {
    // Ліве око
    matrix[7][6] = 9; matrix[7][7] = 9; matrix[7][8] = 9;
    matrix[8][6] = 6; matrix[8][7] = 7; matrix[8][8] = 6;
    matrix[9][6] = 7; matrix[9][7] = 8; matrix[9][8] = 7;

    // Праве око (якщо не пірат)
    if (aid !== "pirate") {
      matrix[7][11] = 9; matrix[7][12] = 9; matrix[7][13] = 9;
      matrix[8][11] = 6; matrix[8][12] = 7; matrix[8][13] = 6;
      matrix[9][11] = 7; matrix[9][12] = 8; matrix[9][13] = 7;
    }

    // Рум'янець
    matrix[11][5] = 10; matrix[11][6] = 10;
    matrix[11][13] = 10; matrix[11][14] = 10;

    // Посмішка (якщо не ніндзя в масці)
    if (aid !== "ninja") {
      matrix[12][8] = 14; matrix[12][9] = 14; matrix[12][10] = 14; matrix[12][11] = 14;
      matrix[12][9] = 8; matrix[12][10] = 8;
    }
  } else {
    // Дисплей кібер-бота
    matrix[8][6] = 13; matrix[8][7] = 13;
    matrix[8][12] = 13; matrix[8][13] = 13;
    matrix[10][8] = 13; matrix[10][9] = 13; matrix[10][10] = 13; matrix[10][11] = 13;
  }

  // Детермінований розрахунок RPG-статистики (70..100)
  const stats: AvatarStats = {
    leadership: 75 + ((seed ^ 0x1A2B) % 26),
    creativity: 75 + ((seed ^ 0x3C4D) % 26),
    tech: 75 + ((seed ^ 0x5E6F) % 26),
    speed: 75 + ((seed ^ 0x7A8B) % 26),
    teamwork: 75 + ((seed ^ 0x9C0D) % 26),
  };

  return {
    name,
    normalizedName: norm,
    seed,
    archetype,
    palette,
    paletteIndex,
    matrix,
    size: N,
    stats,
    blinkPeriodMs: 3200 + (seed % 2800),
  };
}

export interface RenderAvatarOptions {
  /** Якщо true — очі заплющені (моргання) */
  blinking?: boolean;
  /** Прогрес відмальовки для лазерного сканування (0.0 .. 1.0) */
  progress?: number;
  /** Рендерити фон */
  background?: string;
}

/** Рендеринг піксельного персонажа на Canvas 2D з Retina/High-DPI підтримкою */
export function renderAvatarToCanvas(
  canvas: HTMLCanvasElement,
  avatar: IronAvatarData,
  opts: RenderAvatarOptions = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { matrix, palette, size, archetype } = avatar;
  const w = canvas.width;
  const h = canvas.height;
  const cell = w / size;
  const progress = opts.progress ?? 1.0;
  const isBlinking = Boolean(opts.blinking);

  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, w, h);
  }

  const activeRow = progress * size;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let val = matrix[r][c];
      if (val === 0) continue;

      // М'яке природне моргання (^ ^) без артефактів
      if (isBlinking && archetype.id !== 'robot') {
        const isLeftEye = (r === 8 || r === 9) && (c >= 6 && c <= 8);
        const isRightEye = (r === 8 || r === 9) && (c >= 11 && c <= 13) && archetype.id !== 'pirate';

        if (isLeftEye || isRightEye) {
          val = r === 9 ? 9 : 1;
        }
      }

      if (r < activeRow) {
        const col = getPixelColor(val, palette);
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(c * cell, r * cell, cell, cell);
        }
      } else if (r < activeRow + 0.8) {
        ctx.fillStyle = '#FFF7ED'; // Сяйво сканування
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }
}

/** Конвертує аватар у PNG Data URL для експорту / бейджів */
export function toDataURL(avatar: IronAvatarData, size = 256): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  renderAvatarToCanvas(canvas, avatar);
  return canvas.toDataURL('image/png');
}

/** Експорт у чистий, легкий SVG з екрануванням тексту */
export function toSVG(avatar: IronAvatarData, exportSize = 512): string {
  const { matrix, palette, size: N, name, archetype } = avatar;
  const safeName = String(name ?? '').replace(/[<>&"']/g, '');
  
  let rects = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const val = matrix[r][c];
      if (val !== 0) {
        const col = getPixelColor(val, palette);
        if (col) {
          rects += `  <rect x="${c}" y="${r}" width="1" height="1" fill="${col}"/>\n`;
        }
      }
    }
  }

  return `<!-- Всеукраїнський проєкт «Залізна Зміна» | Учасник: ${safeName} (${archetype.title}) -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" width="${exportSize}" height="${exportSize}">\n${rects}</svg>`;
}

export const getSVGCode = toSVG;

/** Допоміжний аніматор для живого моргання на Canvas */
export function createAvatarAnimator(canvas: HTMLCanvasElement, avatar: IronAvatarData) {
  let isDestroyed = false;
  let blinkTimer: any = null;

  const loop = () => {
    if (isDestroyed) return;
    renderAvatarToCanvas(canvas, avatar, { blinking: true });

    setTimeout(() => {
      if (isDestroyed) return;
      renderAvatarToCanvas(canvas, avatar, { blinking: false });
      blinkTimer = setTimeout(loop, avatar.blinkPeriodMs);
    }, 180);
  };

  renderAvatarToCanvas(canvas, avatar, { blinking: false });
  blinkTimer = setTimeout(loop, avatar.blinkPeriodMs);

  return () => {
    isDestroyed = true;
    if (blinkTimer) clearTimeout(blinkTimer);
  };
}

export type AvatarData = IronAvatarData;
