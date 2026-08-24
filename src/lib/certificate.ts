/**
 * Список шляхів до PDF-бланка
 */
const CANDIDATE_PDF_PATHS = [
  '/certificate-template.pdf',
  '/certificate.pdf',
  '/Сертифікат_загальний_Залізна_Зміна.pdf',
  encodeURI('/Сертифікат_загальний_Залізна_Зміна.pdf'),
];

/** Стабільні CDN-джерела TrueType-шрифту з повною підтримкою кирилиці (І, Ї, Є, Ґ, апостроф) */
const FONT_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Bold.ttf',
  'https://cdn.jsdelivr.net/npm/roboto-font@0.1.0/fonts/Roboto/roboto-bold-webfont.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/Roboto-Bold.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/static/Montserrat-Bold.ttf',
];

// Словник цензури
const PROHIBITED_WORDS = [
  'хуй', 'пізд', 'єбат', 'ебат', 'бляд', 'сука', 'мусор', 'гандон', 'чмо', 'лох', 'залуп', 'дроч', 'хер', 'підар', 'пидор', 'нах'
];

/** Перевірка магічних байтів шрифту (TrueType / OpenType header) */
function isValidFontBuffer(buffer: ArrayBuffer): boolean {
  if (!buffer || buffer.byteLength < 10000) return false;
  const view = new DataView(buffer);
  const magic = view.getUint32(0);
  // 0x00010000 (TrueType), 0x4F54544F (OTTO), 0x74727565 (true)
  return magic === 0x00010000 || magic === 0x4F54544F || magic === 0x74727565;
}

/** Динамічне завантаження PDF-Lib та Fontkit */
async function loadPdfEngine() {
  if (typeof window === 'undefined') throw new Error('Потрібне середовище браузера');

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
      script.onerror = () => reject(new Error(`Не вдалося завантажити скрипт ${src}`));
      document.head.appendChild(script);
    });
  };

  try {
    await Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'),
      loadScript('https://unpkg.com/@pdf-lib/fontkit@0.0.4/dist/fontkit.umd.min.js'),
    ]);
  } catch {
    await Promise.all([
      loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@0.0.4/dist/fontkit.umd.min.js'),
    ]);
  }

  if (!win.PDFLib || !win.fontkit) {
    throw new Error('Не вдалося ініціалізувати PDF-рушій');
  }

  return {
    PDFDocument: win.PDFLib.PDFDocument,
    rgb: win.PDFLib.rgb,
    fontkit: win.fontkit,
  };
}

/** Завантаження PDF-бланка з перевіркою */
async function fetchPdfTemplateBytes(): Promise<ArrayBuffer> {
  for (const path of CANDIDATE_PDF_PATHS) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > 1000) {
          return bytes;
        }
      }
    } catch {
      // пробуємо наступний шлях
    }
  }
  throw new Error('Файл бланка не знайдено в папці public/');
}

/** Завантаження шрифту з валідацією заголовків */
async function fetchCyrillicFontBytes(): Promise<ArrayBuffer> {
  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        if (isValidFontBuffer(bytes)) {
          return bytes;
        }
      }
    } catch {
      // пробуємо наступне дзеркало
    }
  }
  throw new Error('Не вдалося завантажити шрифт із підтримкою кирилиці');
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

/** Валідація імені */
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

  const normNew = normalizeUkrainianText(cleanNew);
  for (const bad of PROHIBITED_WORDS) {
    if (normNew.includes(bad)) {
      return { ok: false, error: 'Введено неприпустимі або некоректні слова' };
    }
  }

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
 * Генерація персоналізованого векторного PDF
 */
export async function generatePersonalizedPdf(name: string): Promise<{ pdfBlob: Blob; pdfUrl: string }> {
  const { PDFDocument, rgb, fontkit } = await loadPdfEngine();

  const [pdfBytes, fontBytes] = await Promise.all([
    fetchPdfTemplateBytes(),
    fetchCyrillicFontBytes(),
  ]);

  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const customFont = await pdfDoc.embedFont(fontBytes);

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  // Автопідбір розміру тексту
  const formattedName = name.trim().toUpperCase();
  const maxAllowedWidth = width * 0.68;
  
  let fontSize = height * 0.046;
  const minFontSize = height * 0.020;

  while (fontSize > minFontSize) {
    const textWidth = customFont.widthOfTextAtSize(formattedName, fontSize);
    if (textWidth <= maxAllowedWidth) {
      break;
    }
    fontSize -= 1.5;
  }

  const finalWidth = customFont.widthOfTextAtSize(formattedName, fontSize);
  const centerX = (width - finalWidth) / 2;
  
  // Координати Y плашки
  const centerY = height * 0.488;

  // Малюємо ім'я у фірмовому кольорі (#0E172E)
  firstPage.drawText(formattedName, {
    x: centerX,
    y: centerY,
    size: fontSize,
    font: customFont,
    color: rgb(14 / 255, 23 / 255, 46 / 255),
  });

  const modifiedPdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(pdfBlob);

  return { pdfBlob, pdfUrl };
}
