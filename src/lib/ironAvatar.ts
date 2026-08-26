/**
 * IRON AVATAR ENGINE v3.0 (TypeScript Production Edition)
 * Всеукраїнський проєкт «Залізна Зміна»
 * 
 * Детермінований генератор 32-х авторських 8-bit персонажів на матриці 20×20.
 * Завжди генерує однакового героя для одного й того самого ПІБ.
 */

export const AVATAR_GRID = 20;

export interface Archetype {
  id: string;
  name: string;
  title: string;
  power: string;
  artifact: string;
}

export interface Palette {
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

export interface IronAvatarData {
  name: string;
  seed: number;
  archetype: Archetype;
  palette: Palette;
  paletteIndex: number;
  matrix: number[][];
  size: number;
  blinkPeriodMs: number;
}

// 1. БАЗА 32-Х КАРДИНАЛЬНО РІЗНИХ КАЗКОВИХ АРХЕТИПІВ
export const HERO_ARCHETYPES: Archetype[] = [
  { id: "pirate", name: "Кібер-Пірат", title: "🏴‍☠️ КІБЕР-ПІРАТ МАГІСТРАЛЕЙ", power: "🗺️ Пошук Скарбів", artifact: "⚓️ Золотий Якір" },
  { id: "dino", name: "Динозаврик", title: "🦕 ДРАКОНЧИК ІННОВАЦІЙ", power: "🔥 Залізне Полум'я", artifact: "🦖 Смарагдовий Шип" },
  { id: "astro", name: "Астронавт", title: "🚀 КОСМОНАВТ «ЗАЛІЗНОЇ ЗМІНИ»", power: "🌌 Невагомість", artifact: "🪐 Квантовий Шолом" },
  { id: "wizard", name: "Кібер-Маг", title: "🧙‍♂️ ЧАРІВНИК МАЙБУТНЬОГО", power: "✨ Магія Ідей", artifact: "🔮 Зоряний Кристал" },
  { id: "cat", name: "Неонове Кошеня", title: "🐱 НЕОНОВИЙ КІТ-ШТУРМАН", power: "⚡️ Супер-Швидкість", artifact: "🔔 Сяючий Дзвіночок" },
  { id: "ninja", name: "Тіньовий Ніндзя", title: "🥷 НІНДЗЯ ЗАЛІЗНИХ МАГІСТРАЛЕЙ", power: "💨 Невидимість", artifact: "🗡️ Неоновий Сюрикен" },
  { id: "robot", name: "Ретро-Андроїд", title: "🤖 ДОБРИЙ КІБЕР-БОТ", power: "🧠 Штучний Інтелект", artifact: "⚡️ Лазерне Серце" },
  { id: "crown", name: "Королівський Лідер", title: "👑 КОРОЛІВСЬКИЙ ЧЕМПІОН", power: "🌟 Лідерство 100%", artifact: "💎 Рубінова Корона" },
  { id: "teddy", name: "Ведмедик Тедді", title: "🐻 ВЕДМЕДИК-ВИНАХІДНИК", power: "🍯 Затишок і Сила", artifact: "🧸 Медовий Значок" },
  { id: "gamer", name: "Кіберспортсмен", title: "🎧 ПРО-ГЕЙМЕР ПРОЄКТУ", power: "🎮 Реакція 999 FPS", artifact: "🕹️ RGB-Навушники" },
  { id: "hero", name: "Супергерой", title: "🦸 СУПЕРГЕРОЙ ЗМІН", power: "💥 Незламна Воля", artifact: "⚡️ Шеврон Світла" },
  { id: "fox", name: "Хитрий Лис", title: "🦊 ЛИСИЧКА-СТРАТЕГ", power: "🎯 Кмітливість", artifact: "🍃 Чарівний Хвостик" },
  { id: "artist", name: "Арт-Геній", title: "🎨 ХУДОЖНИК МАЙБУТНЬОГО", power: "🌈 Творчий Вибух", artifact: "🖌️ Золотий Пензель" },
  { id: "scientist", name: "Божевільний Вчений", title: "🥽 ПРОФЕСОР ІННОВАЦІЙ", power: "💡 Еврика!", artifact: "🧪 Плазмова Колба" },
  { id: "unicorn", name: "Казковий Єдиноріг", title: "🦄 ЗОРЯНИЙ ЄДИНОРІГ", power: "✨ Сяйво Райдуги", artifact: "🌟 Золотий Ріг" },
  { id: "frog", name: "Жабка-Детектив", title: "🐸 ВЕСЕЛА ЖАБКА", power: "🌊 Водний Стрибок", artifact: "🍀 Листок Удачі" },
  { id: "detective", name: "Детектив Поїзда", title: "🕵️‍♂️ ШЕРЛОК МАГІСТРАЛЕЙ", power: "🔍 Дедукція", artifact: "🔎 Голографічна Лупа" },
  { id: "rockstar", name: "Рок-Музикант", title: "🎸 РОК-ЗІРКА ДРАЙВУ", power: "🔊 Звуковий Шок", artifact: "⚡️ Медіатор Сонця" },
  { id: "diver", name: "Акванавт", title: "🤿 ГЛИБОКОВОДНИЙ ДОСЛІДНИК", power: "🫧 Океанський Подих", artifact: "🐚 Перлина Глибин" },
  { id: "knight", name: "Залізний Лицар", title: "⚔️ ЛИЦАР «ЗАЛІЗНОЇ ЗМІНИ»", power: "🛡️ Абсолютний Захист", artifact: "🗡️ Сталевий Меч" },
  { id: "fairy", name: "Лісова Фея", title: "🌸 КВІТКОВА ФЕЯ", power: "🌿 Сила Природи", artifact: "🌺 Квітковий Вінок" },
  { id: "bee", name: "Бджілка-Трудар", title: "🐝 БДЖІЛКА ІННОВАЦІЙ", power: "⚡️ Працьовитість", artifact: "🍯 Золотий Нектар" },
  { id: "panda", name: "Пандочка", title: "🐼 МУДРА ПАНДА", power: "🥋 Кунг-Фу Спокій", artifact: "🎋 Бамбуковий Пагін" },
  { id: "lightning", name: "Повелитель Струму", title: "⚡️ ПОВЕЛИТЕЛЬ ВОЛЬТІВ", power: "🔋 1000 Вольт", artifact: "⚡️ Блискавка Сонця" },
  { id: "racer", name: "Гонщик Поїзда", title: "🏎️ ПІЛОТ ШВИДКОСТІ", power: "🏁 500 км/год", artifact: "🏆 Кубок Чемпіона" },
  { id: "penguin", name: "Пінгвінчик", title: "🐧 ПОЛЯРНИЙ ПІНГВІН", power: "❄️ Морозна Сила", artifact: "🐟 Крижана Зірка" },
  { id: "karate", name: "Майстер Єдиноборств", title: "🥋 МАЙСТЕР БОЙОВИХ МИСТЕЦТВ", power: "🥋 Чорний Пояс", artifact: "🔴 Пов'язка Сонця" },
  { id: "bunny", name: "Сяючий Зайчик", title: "🥕 СОНЯЧИЙ ЗАЙЧИК", power: "🐰 Супер-Стрибок", artifact: "🥕 Золота Морквинка" },
  { id: "alien", name: "Дружній Прибулець", title: "🛸 ГІСТЬ З ГАЛАКТИКИ", power: "🌌 Телекінез", artifact: "🛸 Літаюча Тарілка" },
  { id: "pumpkin", name: "Гарбузовий Герой", title: "🎃 ГАРБУЗОВИЙ ВАРТОВИЙ", power: "🔥 Вогняний Сміх", artifact: "🕯️ Вічний Вогник" },
  { id: "train_chef", name: "Шеф-Машиніст", title: "🚂 ГОЛОВНИЙ МАШИНІСТ", power: "🚄 Тяга 100 000 к.с.", artifact: "🧢 Кашкетка №1" },
  { id: "angel", name: "Крилата Мрія", title: "🕊️ КРИЛАТИЙ МРІЙНИК", power: "🪽 Політ Натхнення", artifact: "✨ Німб Світла" }
];

export const ARCHETYPES = HERO_ARCHETYPES;

// 2. ДЕТЕРМІНОВАНІ ПАЛІТРИ
export const BRIGHT_PALETTES: Palette[] = [
  {
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
    name: "Сонячний Райдужний",
    skin: "#FFE0C0",
    skinShade: "#E29D68",
    mainColor: "#FFB800",
    secondColor: "#FF4081",
    darkColor: "#2A1800",
    eyeColor: "#00E676",
    bloom: "rgba(255, 184, 0, 0.45)",
    affinity: "☀️ Сонячне Тепло"
  }
];

export const IRON_PALETTES = BRIGHT_PALETTES;

// 3. ХЕШУВАННЯ ТА PRNG
export function fnv1a(str: string): number {
  const s = (str || "Залізна Зміна").trim().toLowerCase();
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
    case 9: return '#221510';
    case 10: return '#FF4081';
    case 11: return '#FA5A15';
    case 12: return '#FFD000';
    case 13: return '#FFFFFF';
    case 14: return '#E91E63';
    case 15: return '#00F0FF';
    default: return null;
  }
}

export const getPixelHex = getPixelColor;

// 5. ГЕНЕРАЦІЯ 20×20 МАТРИЦІ З 32 ОКРЕМИМИ ОБРАЗАМИ
export function generateIronAvatar(name: string): IronAvatarData {
  const seed = fnv1a(name || "Залізна Зміна");
  const rng = createPRNG(seed);

  const archetypeIndex = seed % HERO_ARCHETYPES.length;
  const archetype = HERO_ARCHETYPES[archetypeIndex];
  const paletteIndex = Math.floor(rng() * BRIGHT_PALETTES.length);
  const palette = BRIGHT_PALETTES[paletteIndex];

  const N = 20;
  const matrix: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  const aid = archetype.id;

  // Базовий одяг / тіло
  for (let r = 15; r <= 19; r++) {
    for (let c = 3; c <= 16; c++) matrix[r][c] = 3;
  }
  matrix[16][3] = 4; matrix[17][3] = 4; matrix[18][3] = 4;
  matrix[16][16] = 4; matrix[17][16] = 4; matrix[18][16] = 4;
  matrix[16][9] = 11; matrix[16][10] = 11;
  matrix[17][9] = 12; matrix[17][10] = 12;

  // Базове обличчя
  for (let r = 6; r <= 14; r++) {
    for (let c = 4; c <= 15; c++) {
      if ((r === 6 || r === 14) && (c <= 5 || c >= 14)) continue;
      matrix[r][c] = (r === 14 || c === 4 || c === 15) ? 2 : 1;
    }
  }

  // Індивідуальні деталі костюма та аксесуарів
  switch (aid) {
    case "pirate":
      for (let c = 2; c <= 17; c++) matrix[5][c] = 5;
      for (let r = 2; r <= 4; r++) for (let c = 4; c <= 15; c++) matrix[r][c] = 5;
      matrix[1][3] = 5; matrix[1][16] = 5;
      matrix[3][9] = 13; matrix[3][10] = 13; matrix[4][9] = 11;
      matrix[8][12] = 5; matrix[9][12] = 5; matrix[10][12] = 5; matrix[9][12] = 12;
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
      matrix[6][9] = 6; matrix[6][10] = 7;
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

  // КРАСИВІ, ГЛИБОКІ ОЧІ З БЛІКАМИ, ВІЯМИ ТА ПОСМІШКОЮ
  if (aid !== "robot") {
    // Ліве око
    matrix[7][6] = 9; matrix[7][7] = 9; matrix[7][8] = 9;
    matrix[8][6] = 6; matrix[8][7] = 7; matrix[8][8] = 6;
    matrix[9][6] = 7; matrix[9][7] = 8; matrix[9][8] = 7;

    // Праве око
    if (aid !== "pirate") {
      matrix[7][11] = 9; matrix[7][12] = 9; matrix[7][13] = 9;
      matrix[8][11] = 6; matrix[8][12] = 7; matrix[8][13] = 6;
      matrix[9][11] = 7; matrix[9][12] = 8; matrix[9][13] = 7;
    }

    // Рум'янець
    matrix[11][5] = 10; matrix[11][6] = 10;
    matrix[11][13] = 10; matrix[11][14] = 10;

    // Посмішка
    if (aid !== "ninja") {
      matrix[12][8] = 14; matrix[12][9] = 14; matrix[12][10] = 14; matrix[12][11] = 14;
      matrix[12][9] = 8; matrix[12][10] = 8;
    }
  } else {
    // Дисплей кібер-андроїда
    matrix[8][6] = 13; matrix[8][7] = 13;
    matrix[8][12] = 13; matrix[8][13] = 13;
    matrix[10][8] = 13; matrix[10][9] = 13; matrix[10][10] = 13; matrix[10][11] = 13;
  }

  return {
    name,
    seed,
    archetype,
    palette,
    paletteIndex,
    matrix,
    size: N,
    blinkPeriodMs: 3200 + (seed % 2800),
  };
}

export interface RenderAvatarOptions {
  /** Якщо true — очі заплющені (моргання) */
  blinking?: boolean;
  /** Прогрес відмальовки для лазерного сканування (0.0 .. 1.0) */
  progress?: number;
}

/** Рендеринг піксельного персонажа на Canvas 2D */
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

  const activeRow = progress * size;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let val = matrix[r][c];
      if (val === 0) continue;

      // М'яке природне моргання (^ ^)
      if (isBlinking && archetype.id !== 'robot') {
        if ((r === 8 || r === 9) && ((c >= 6 && c <= 8) || (c >= 11 && c <= 13))) {
          if (r === 9) val = 9;
          else val = 1;
        }
      }

      if (r < activeRow) {
        const col = getPixelColor(val, palette);
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(c * cell, r * cell, cell, cell);
        }
      } else if (r < activeRow + 0.8) {
        ctx.fillStyle = '#FFF7ED'; // Квантовий спалах збірки
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }
}

/** Експорт у чистий, легкий SVG (без залежностей) */
export function toSVG(avatar: IronAvatarData, exportSize = 512): string {
  const { matrix, palette, size: N, name, archetype } = avatar;
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
  return `<!-- Всеукраїнський проєкт «Залізна Зміна» | Учасник: ${name} (${archetype.title}) -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" width="${exportSize}" height="${exportSize}">\n${rects}</svg>`;
}

export const getSVGCode = toSVG;
