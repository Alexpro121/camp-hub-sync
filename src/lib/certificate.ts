/** Шлях до оригінального PDF-бланка в папці public/ */
export const CERTIFICATE_PDF_PATH = '/Сертифікат_загальний_Залізна_Зміна.pdf';
export const CERTIFICATE_FALLBACK_PDF = '/certificate-template.pdf';

/** CDN-шрифт із повною підтримкою української кирилиці та апострофів */
const CYRILLIC_FONT_URL = 'https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459Wlhyw.ttf';

// Словник цензури
const PROHIBITED_WORDS = [
  'хуй', 'пізд', 'єбат', 'ебат', 'бляд', 'сука', 'мусор', 'гандон', 'чмо', 'лох', 'залуп', 'дроч', 'хер', 'підар', 'пидор', 'нах'
];

/**
 * Динамічний завантажувач PDF-Lib та Fontkit (без необхідності встановлення в package.json)
 */
async function loadPdfEngine() {
  if (typeof window === 'undefined') throw new Error('PDF generation requires browser environment');

  const win = window as any;

  if (win.PDFLib && win.fontkit) {
    return {
      PDFDocument: win.PDFLib.PDFDocument,
      rgb: win.PDFLib.rgb,
      fontkit: win.fontkit,
    };
  }

  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  };

  // Завантажуємо скрипти з CDN
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'),
    loadScript('https://unpkg.com/@pdf-lib/fontkit@0.0.4/dist/fontkit.umd.min.js'),
  ]);

  if (!win.PDFLib || !win.fontkit) {
    throw new Error('Не вдалося ініціалізувати PDF-рушій');
  }

  return {
    PDFDocument: win.PDFLib.PDFDocument,
    rgb: win.PDFLib.rgb,
    fontkit: win.fontkit,
  };
}

/** Нормалізація українського тексту */
export const normalizeUkrainianText = (str: string): string => {
  return str
    .trim()
    .replace(/[`ʼ’]/g, "'")
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/ъ/g, '');
};

/** Розрахунок відстані Левенштейна */
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
 * Валідація імені: перевіряє цензуру та схожість з початковим ПІБ
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

  // 1. Цензура
  const normNew = normalizeUkrainianText(cleanNew);
  for (const bad of PROHIBITED_WORDS) {
    if (normNew.includes(bad)) {
      return { ok: false, error: 'Введено неприпустимі або некоректні слова' };
    }
  }

  // 2. Схожість імен (Fuzzy Match)
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
 * Завантажує оригінальний PDF-бланк та генерує векторний PDF з нанесеним іменем дитини
 */
export async function generatePersonalizedPdf(name: string): Promise<{ pdfBlob: Blob; pdfUrl: string }> {
  // 1. Ініціалізуємо PDF-рушій
  const { PDFDocument, rgb, fontkit } = await loadPdfEngine();

  // 2. Отримуємо байти PDF-бланка
  let pdfBytes: ArrayBuffer;
  try {
    const res = await fetch(CERTIFICATE_PDF_PATH);
    if (!res.ok) throw new Error('Local PDF not found');
    pdfBytes = await res.arrayBuffer();
  } catch {
    const fallbackRes = await fetch(CERTIFICATE_FALLBACK_PDF);
    pdfBytes = await fallbackRes.arrayBuffer();
  }

  // 3. Отримуємо шрифт із підтримкою кирилиці
  const fontBytes = await fetch(CYRILLIC_FONT_URL).then((res) => res.arrayBuffer());

  // 4. Завантажуємо документ
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);

  // Вбудовуємо шрифт
  const customFont = await pdfDoc.embedFont(fontBytes);

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  // 5. Розрахунок позиції та автопідбір розміру тексту
  const formattedName = name.trim().toUpperCase();
  const maxAllowedWidth = width * 0.68;
  
  let fontSize = height * 0.046; // базовий розмір шрифту
  const minFontSize = height * 0.022;

  while (fontSize > minFontSize) {
    const textWidth = customFont.widthOfTextAtSize(formattedName, fontSize);
    if (textWidth <= maxAllowedWidth) {
      break;
    }
    fontSize -= 1.5;
  }

  const finalWidth = customFont.widthOfTextAtSize(formattedName, fontSize);
  const centerX = (width - finalWidth) / 2;
  
  // Координати центру білої плашки
  const centerY = height * 0.488;

  // 6. Малюємо ім'я у фірмовому темно-синьому кольорі (#0E172E)
  firstPage.drawText(formattedName, {
    x: centerX,
    y: centerY,
    size: fontSize,
    font: customFont,
    color: rgb(14 / 255, 23 / 255, 46 / 255),
  });

  // 7. Зберігаємо та повертаємо PDF
  const modifiedPdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(pdfBlob);

  return { pdfBlob, pdfUrl };
}
