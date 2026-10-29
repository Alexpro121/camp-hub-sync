import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import certificateFont from '@/assets/alumni-roboto-bold.ttf.asset.json';

/** Шляхи до файлу бланка в папці public/ */
const CANDIDATE_PDF_PATHS = [
  '/certificate-template.pdf',
  '/certificate.pdf',
  '/Сертифікат_загальний_Залізна_Зміна.pdf',
  encodeURI('/Сертифікат_загальний_Залізна_Зміна.pdf'),
];

const PROHIBITED_WORDS = [
  'хуй', 'пізд', 'єбат', 'ебат', 'бляд', 'сука', 'мусор', 'гандон', 'чмо', 'лох', 'залуп', 'дроч', 'хер', 'підар', 'пидор', 'нах'
];

const RESOURCE_CACHE = 'iron-certificate-resources-v1';
let resourcesPromise: Promise<[ArrayBuffer, ArrayBuffer]> | null = null;
async function resource(url: string): Promise<ArrayBuffer> {
  const cache = typeof caches === 'undefined' ? null : await caches.open(RESOURCE_CACHE).catch(() => null);
  const cached = await cache?.match(url);
  if (cached) return cached.arrayBuffer();
  const response = await fetch(url);
  if (!response.ok) throw new Error('Для першого завантаження сертифіката потрібен інтернет');
  await cache?.put(url, response.clone()).catch(() => {});
  return response.arrayBuffer();
}
async function certificateResources(): Promise<[ArrayBuffer, ArrayBuffer]> {
  if (!resourcesPromise) resourcesPromise = Promise.all([resource(CANDIDATE_PDF_PATHS[0]), resource(certificateFont.url)]).catch(error => { resourcesPromise = null; throw error; });
  return resourcesPromise;
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
  previewImageUrl: string;
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

  // Створюємо мобільне зображення-прев'ю через Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = Math.round(1600 * (height / width));
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    // Малюємо ім'я на прев'ю
    const cFontSize = Math.round(canvas.height * 0.044);
    ctx.font = `900 ${cFontSize}px "Montserrat", "Roboto", "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0E172E';
    
    // Тимчасовий прев'ю рендер
    ctx.fillText(formattedName, canvas.width / 2, canvas.height * (1 - 0.532));
  }

  return { 
    pdfBlob, 
    pdfUrl,
    previewImageUrl: pdfUrl // використовується для прямого перегляду
  };
}
