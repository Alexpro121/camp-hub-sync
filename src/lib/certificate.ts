/**
 * Шлях до шаблону сертифіката (файл у public/ або CDN fallback)
 */
export const CERTIFICATE_TEMPLATE_PATH = '/Сертифікат_загальний_Залізна_Зміна.png';
export const CERTIFICATE_FALLBACK_URL = 'https://www.ironsquad.org.ua/img/certificate-template-2026.jpg';

// Словник неприпустимих слів для цензури
const PROHIBITED_WORDS = [
  'хуй', 'пізд', 'єбат', 'ебат', 'бляд', 'сука', 'мусор', 'гандон', 'чмо', 'лох', 'залуп', 'дроч', 'хер', 'підар', 'пидор', 'нах'
];

/** Нормалізація українського тексту (апострофи, літери, регістр) */
export const normalizeUkrainianText = (str: string): string => {
  return str
    .trim()
    .replace(/[`ʼ’]/g, "'")
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/ъ/g, '');
};

/** Відстань Левенштейна для виявлення одруківок */
function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Валідація нового імені: перевіряє цензуру та родинність до початкового ПІБ
 */
export function validateCertificateName(
  originalName: string, 
  newName: string
): { ok: boolean; error?: string } {
  const cleanNew = newName.trim();
  const cleanOrig = originalName.trim();

  if (!cleanNew || cleanNew.length < 3) {
    return { ok: false, error: 'Введіть коректне ім’я (мінімум 3 символи)' };
  }

  if (cleanNew.length > 70) {
    return { ok: false, error: 'Ім’я занадто довге (максимум 70 символів)' };
  }

  // 1. Перевірка на цензуру
  const normNew = normalizeUkrainianText(cleanNew);
  for (const bad of PROHIBITED_WORDS) {
    if (normNew.includes(bad)) {
      return { ok: false, error: 'Введено некоректні або неприпустимі слова' };
    }
  }

  // 2. Перевірка на спорідненість імені (Fuzzy Token Match)
  const origTokens = normalizeUkrainianText(cleanOrig).split(/[\s-]+/).filter(t => t.length > 1);
  const newTokens = normNew.split(/[\s-]+/).filter(t => t.length > 1);

  if (origTokens.length === 0 || newTokens.length === 0) {
    return { ok: false, error: 'Введіть повне ім’я' };
  }

  let matchFound = false;

  for (const oToken of origTokens) {
    for (const nToken of newTokens) {
      if (
        oToken === nToken ||
        oToken.startsWith(nToken) ||
        nToken.startsWith(oToken) ||
        levenshteinDistance(oToken, nToken) <= 2
      ) {
        matchFound = true;
        break;
      }
    }
    if (matchFound) break;
  }

  if (!matchFound) {
    return {
      ok: false,
      error: `Нове ім'я має бути схожим на початкове (${cleanOrig})`,
    };
  }

  return { ok: true };
}

/**
 * Малює та генерує сертифікат у надвисокій якості (Ultra-HD 300 DPI) з автоскейлінгом тексту
 */
export async function renderCertificateCanvas(
  name: string,
  imageSource: HTMLImageElement
): Promise<{ dataUrl: string; blob: Blob }> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Не вдалося створити контекст Canvas');

  // Висока роздільна здатність бланка
  const width = imageSource.naturalWidth || 2000;
  const height = imageSource.naturalHeight || 1350;
  canvas.width = width;
  canvas.height = height;

  // 1. Рендеримо фоновий оригінальний бланк
  ctx.drawImage(imageSource, 0, 0, width, height);

  // 2. Параметри плашки для імені (точні координати за шаблоном 2026)
  const centerX = width * 0.5;
  const centerY = height * 0.505; // центр виділеної білої плашки
  const maxAllowedWidth = width * 0.68; // ширина зони тексту

  // 3. Автоматичний підбір розміру шрифту, щоб довгі імена ніколи не вилазили
  let fontSize = Math.round(height * 0.046); // базовий великий розмір (~62px)
  const minFontSize = Math.round(height * 0.024); // мінімальний розмір (~32px)

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0B132B'; // Фірмовий темно-синій колір оригінального бланка

  const formattedName = name.trim().toUpperCase();

  do {
    ctx.font = `900 ${fontSize}px "Montserrat", "Plus Jakarta Sans", -apple-system, sans-serif`;
    const measuredWidth = ctx.measureText(formattedName).width;
    if (measuredWidth <= maxAllowedWidth || fontSize <= minFontSize) {
      break;
    }
    fontSize -= 2;
  } while (fontSize > minFontSize);

  // 4. Малюємо ім'я учасника
  ctx.fillText(formattedName, centerX, centerY);

  // 5. Отримуємо Blob та DataURL
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Помилка генерації файлу'));
    }, 'image/png', 1.0);
  });

  return { dataUrl, blob };
}
