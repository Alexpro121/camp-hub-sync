import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getPdfJsLib } from '@/lib/pdfjsLoader';

/**
 * Бланк і шрифт лежать у public/ і віддаються з нашого домену. Раніше шрифт брався зі шляху
 * `/__l5e/assets-v1/…`, який існує лише на хостингу Lovable: деінде там була сторінка index.html,
 * вбудувати «шрифт» не вдавалось, і сертифікат не генерувався.
 */
const TEMPLATE_URL = '/certificate-template.pdf';
const FONT_URL = '/fonts/Roboto-Bold.ttf';

const PROHIBITED_WORDS = [
  'хуй', 'пізд', 'єбат', 'ебат', 'бляд', 'сука', 'мусор', 'гандон', 'чмо', 'лох', 'залуп', 'дроч', 'хер', 'підар', 'пидор', 'нах'
];

const RESOURCE_CACHE = 'iron-certificate-resources-v2';
let resourcesPromise: Promise<[ArrayBuffer, ArrayBuffer]> | null = null;

const startsWith = (buf: ArrayBuffer, bytes: number[]) => {
  const head = new Uint8Array(buf.slice(0, bytes.length));
  return bytes.every((b, i) => head[i] === b);
};
const isPdf = (buf: ArrayBuffer) => startsWith(buf, [0x25, 0x50, 0x44, 0x46]); // %PDF
const isFont = (buf: ArrayBuffer) =>
  startsWith(buf, [0x00, 0x01, 0x00, 0x00]) || startsWith(buf, [0x4f, 0x54, 0x54, 0x4f]) || startsWith(buf, [0x74, 0x72, 0x75, 0x65]);

/** Файл із кешу чи мережі; відповідь «не того типу» (наприклад, index.html замість файлу) не кешується. */
async function resource(url: string, valid: (buf: ArrayBuffer) => boolean): Promise<ArrayBuffer> {
  const cache = typeof caches === 'undefined' ? null : await caches.open(RESOURCE_CACHE).catch(() => null);
  const cached = await cache?.match(url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    if (valid(buf)) return buf;
    await cache?.delete(url).catch(() => {});
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Для першого завантаження сертифіката потрібен інтернет');
  }
  if (!response.ok) throw new Error('Не вдалося завантажити файли сертифіката. Спробуйте пізніше');
  const buf = await response.clone().arrayBuffer();
  if (!valid(buf)) throw new Error('Файли сертифіката на сервері пошкоджені або відсутні');
  await cache?.put(url, response).catch(() => {});
  return buf;
}
async function certificateResources(): Promise<[ArrayBuffer, ArrayBuffer]> {
  if (!resourcesPromise) {
    resourcesPromise = Promise.all([resource(TEMPLATE_URL, isPdf), resource(FONT_URL, isFont)]).catch((error) => {
      resourcesPromise = null;
      throw error;
    });
  }
  return resourcesPromise;
}

/** Прев'ю першої сторінки PDF як зображення: мобільні браузери не показують PDF у <object>. */
export async function renderPdfPreview(pdfBytes: Uint8Array, targetWidth = 1200, timeoutMs = 10_000): Promise<string | null> {
  // CDN із PDF.js може бути недоступний: прев'ю необов'язкове і ніколи не блокує завантаження PDF.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([renderPdfPreviewInner(pdfBytes, targetWidth), timeout]);
}

async function renderPdfPreviewInner(pdfBytes: Uint8Array, targetWidth: number): Promise<string | null> {
  try {
    const pdfjs = await getPdfJsLib();
    if (!pdfjs) return null;
    const doc = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}

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
      return { ok: false, error: 'Введено некоректні або неприпустимі слова' };
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
 * Генерує офіційний PDF та мобільне прев'ю-зображення з точним позиціонуванням
 */
export async function generatePersonalizedPdf(name: string): Promise<{ 
  pdfBlob: Blob; 
  pdfUrl: string;
  /** Байти PDF для прев'ю-зображення (renderPdfPreview). */
  pdfBytes: Uint8Array;
}> {
  const [pdfBytes, fontBytes] = await certificateResources();

  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const customFont = await pdfDoc.embedFont(fontBytes);

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  // Автопідбір розміру тексту
  const formattedName = name.trim().toUpperCase();
  const maxAllowedWidth = width * 0.66;
  
  let fontSize = height * 0.044; // ~26pt для A4
  const minFontSize = height * 0.020;

  while (fontSize > minFontSize) {
    const textWidth = customFont.widthOfTextAtSize(formattedName, fontSize);
    if (textWidth <= maxAllowedWidth) break;
    fontSize -= 1.5;
  }

  const finalWidth = customFont.widthOfTextAtSize(formattedName, fontSize);
  const centerX = (width - finalWidth) / 2;
  
  // ✅ ТОЧНА КООРДИНАТА ЦЕНТРУ БІЛОЇ ПЛАШКИ (у PDF вісь Y йде знизу вгору)
  const centerY = height * 0.532;

  // Малюємо текст у векторному PDF
  firstPage.drawText(formattedName, {
    x: centerX,
    y: centerY,
    size: fontSize,
    font: customFont,
    color: rgb(14 / 255, 23 / 255, 46 / 255), // #0E172E
  });

  const modifiedPdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([new Uint8Array(modifiedPdfBytes).buffer], { type: 'application/pdf' });
  const pdfUrl = URL.createObjectURL(pdfBlob);

  return { 
    pdfBlob, 
    pdfUrl,
    pdfBytes: modifiedPdfBytes,
  };
}
