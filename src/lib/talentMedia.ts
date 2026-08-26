import { supabase } from '@/integrations/supabase/client';
import type { TalentAttachment, TalentFileKind } from '@/types/app';

export const TALENT_BUCKET = 'talent-media';

/** Термін дії підписаного посилання на медіафайл (7 діб) */
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

const MB = 1024 * 1024;

export const TALENT_MEDIA_RULES: Record<TalentFileKind, { exts: string[]; maxSize: number; label: string }> = {
  audio: { exts: ['mp3', 'wav', 'm4a', 'aac', 'ogg'], maxSize: 35 * MB, label: 'Аудіо' },
  image: { exts: ['jpg', 'jpeg', 'png', 'webp'], maxSize: 15 * MB, label: 'Зображення' },
  video: { exts: ['mp4', 'mov', 'webm'], maxSize: 60 * MB, label: 'Відео' },
  doc: { exts: ['pdf', 'txt', 'docx'], maxSize: 15 * MB, label: 'Документ' },
};

export const TALENT_ACCEPT = '.mp3,.wav,.m4a,.aac,.ogg,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.pdf,.txt,.docx';

/** Готові пресети призначення файлу для супроводу */
export const LABEL_PRESETS = [
  'Фонограма (мінус)',
  'Фонограма (плюс)',
  'Фон на екран',
  'Відео-супровід',
  'Слайди / Текст',
  'Сценарій номера',
];

/** Мапа гарантованих MIME-типів для безпомилкового стрімінгу аудіо/відео */
const MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function getFileExt(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function detectFileKind(ext: string): TalentFileKind {
  const e = ext.toLowerCase();
  for (const kind of Object.keys(TALENT_MEDIA_RULES) as TalentFileKind[]) {
    if (TALENT_MEDIA_RULES[kind].exts.includes(e)) return kind;
  }
  return 'doc';
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 Б';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / MB).toFixed(1)} МБ`;
}

/** Транслітерація для безпечних системних шляхів у сховищі */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '', ё: 'e',
  "'": '', '’': '', 'ʼ': '', '`': '',
};

export function translit(input: string): string {
  return (input || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('');
}

/** Безпечний фрагмент імені файлу зі збереженням кирилиці */
export function safeNamePart(input: string, max = 40): string {
  return (input || '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max) || 'file';
}

/** Стандартизоване ім'я файлу для пульта сцени: 01_К6_Танець_Гуцулка_Фонограма_мінус.mp3 */
export function buildStageFileName(
  orderNumber: number,
  teamNumber: number,
  actTitle: string,
  attachment: TalentAttachment,
): string {
  const idx = String(orderNumber).padStart(2, '0');
  const safeTitle = safeNamePart(actTitle, 35);
  const safeLabel = safeNamePart(attachment.label || attachment.fileName, 30);
  
  return `${idx}_К${teamNumber}_${safeTitle}_${safeLabel}.${attachment.fileExt}`;
}

/** Ім'я файлу всередині ZIP-теки виступу: 01_Фонограма_мінус.mp3 */
export function buildZipFileName(index: number, attachment: TalentAttachment): string {
  const num = String(index).padStart(2, '0');
  const safeLabel = safeNamePart(attachment.label || attachment.fileName, 35);
  return `${num}_${safeLabel}.${attachment.fileExt}`;
}

/** Тека виступу в архіві: 01_К6_Танець_Гуцулка */
export function buildZipFolderName(orderNumber: number, teamNumber: number, actTitle: string): string {
  const num = String(orderNumber).padStart(2, '0');
  return `${num}_К${teamNumber}_${safeNamePart(actTitle, 40)}`;
}

export function parseAttachments(raw: unknown): TalentAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is TalentAttachment => 
      !!a && typeof a === 'object' && 'storagePath' in (a as object) && 'id' in (a as object)
  );
}

/** Отримання свіжого підписаного URL для безпечного відтворення/скачування */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(TALENT_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export interface UploadResult {
  attachment?: TalentAttachment;
  error?: string;
}

/** Завантаження файлу у сховище та формування метаданих */
export async function uploadTalentFile(
  file: File, 
  teamNumber: number, 
  label: string
): Promise<UploadResult> {
  const ext = getFileExt(file.name);
  if (!ext) return { error: 'Файл без розширення не підтримується' };

  const kind = detectFileKind(ext);
  const rule = TALENT_MEDIA_RULES[kind];
  if (!rule.exts.includes(ext)) {
    return { error: `Формат .${ext} не підтримується для категорії «${rule.label}»` };
  }
  if (file.size > rule.maxSize) {
    return { error: `${rule.label}: максимальний розмір ${formatFileSize(rule.maxSize)}` };
  }

  const id = crypto.randomUUID();
  const rawBaseName = file.name.replace(/\.[^.]+$/, '');
  const cleanBaseName = safeNamePart(translit(rawBaseName), 28) || 'media';
  const storagePath = `team-${teamNumber}/${id}_${cleanBaseName}.${ext}`;

  // Визначаємо точний Content-Type (з фолбеком на внутрішню мапу)
  const resolvedContentType = file.type || MIME_MAP[ext] || 'application/octet-stream';

  const { error } = await supabase.storage.from(TALENT_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: resolvedContentType,
  });

  if (error) {
    return { error: error.message || 'Не вдалося завантажити файл у сховище' };
  }

  const fileUrl = (await getSignedUrl(storagePath)) || '';

  return {
    attachment: {
      id,
      label: label.trim() || file.name,
      fileName: file.name,
      fileExt: ext,
      storagePath,
      fileUrl,
      fileType: kind,
      fileSize: file.size,
      uploadedAt: Date.now(),
    },
  };
}

/** Фізичне видалення одного файлу зі сховища */
export async function removeTalentFile(storagePath: string): Promise<void> {
  if (!storagePath) return;
  try {
    await supabase.storage.from(TALENT_BUCKET).remove([storagePath]);
  } catch (_err) {
    /* ignore error */
  }
}

/** Пакетне видалення кількох файлів (наприклад при видаленні номера) */
export async function removeTalentFiles(storagePaths: string[]): Promise<void> {
  const validPaths = (storagePaths || []).filter(Boolean);
  if (!validPaths.length) return;
  try {
    await supabase.storage.from(TALENT_BUCKET).remove(validPaths);
  } catch (_err) {
    /* ignore error */
  }
}

/** Збереження масиву прикріплень у базі даних */
export async function persistAttachments(entryId: string, attachments: TalentAttachment[]) {
  return supabase
    .from('talent_entries')
    .update({ attachments: attachments as unknown as never })
    .eq('id', entryId);
}
