import { supabase } from '@/integrations/supabase/client';
import type { TalentAttachment, TalentFileKind } from '@/types/app';

export const TALENT_BUCKET = 'talent-media';

/** Термін дії підписаного посилання на медіафайл (7 діб) */
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

const MB = 1024 * 1024;

export const TALENT_MEDIA_RULES: Record<TalentFileKind, { exts: string[]; maxSize: number; label: string }> = {
  audio: { exts: ['mp3', 'wav', 'm4a'], maxSize: 35 * MB, label: 'Аудіо' },
  image: { exts: ['jpg', 'jpeg', 'png', 'webp'], maxSize: 15 * MB, label: 'Зображення' },
  video: { exts: ['mp4', 'mov'], maxSize: 60 * MB, label: 'Відео' },
  doc: { exts: ['pdf', 'txt', 'docx'], maxSize: 15 * MB, label: 'Документ' },
};

export const TALENT_ACCEPT = '.mp3,.wav,.m4a,.jpg,.jpeg,.png,.webp,.mp4,.mov,.pdf,.txt,.docx';

/** Готові пресети призначення файлу */
export const LABEL_PRESETS = [
  'Фонограма (мінус)',
  'Фон на екран',
  'Відео-супровід',
  'Слайди / Текст',
];

export function getFileExt(name: string): string {
  const parts = name.split('.');
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
  if (!bytes) return '0 Б';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / MB).toFixed(1)} МБ`;
}

/** Транслітерація та очищення рядка для безпечних імен файлів */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '', ё: 'e',
};

export function translit(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('');
}

/** Безпечний фрагмент імені файлу зі збереженням кирилиці (для завантажень користувачу) */
export function safeNamePart(input: string, max = 40): string {
  return (input || '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max) || 'file';
}

/** Стандартизоване ім'я файлу для сцени: 01_К6_Танець_Гуцулка_Фонограма_мінус.mp3 */
export function buildStageFileName(
  orderNumber: number,
  teamNumber: number,
  actTitle: string,
  attachment: TalentAttachment,
): string {
  const idx = String(orderNumber).padStart(2, '0');
  return [
    idx,
    `К${teamNumber}`,
    safeNamePart(actTitle),
    safeNamePart(attachment.label || attachment.fileName),
  ].join('_') + `.${attachment.fileExt}`;
}

/** Ім'я файлу всередині ZIP-теки виступу: 01_Фонограма_мінус.mp3 */
export function buildZipFileName(index: number, attachment: TalentAttachment): string {
  return `${String(index).padStart(2, '0')}_${safeNamePart(attachment.label || attachment.fileName)}.${attachment.fileExt}`;
}

/** Тека виступу в архіві: 01_К6_Танець_Гуцулка */
export function buildZipFolderName(orderNumber: number, teamNumber: number, actTitle: string): string {
  return `${String(orderNumber).padStart(2, '0')}_К${teamNumber}_${safeNamePart(actTitle)}`;
}

export function parseAttachments(raw: unknown): TalentAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is TalentAttachment => !!a && typeof a === 'object' && 'storagePath' in (a as object));
}

/** Свіже підписане посилання на приватний файл сховища */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(TALENT_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export interface UploadResult {
  attachment?: TalentAttachment;
  error?: string;
}

/** Завантаження файлу у сховище та формування метаданих */
export async function uploadTalentFile(file: File, teamNumber: number, label: string): Promise<UploadResult> {
  const ext = getFileExt(file.name);
  if (!ext) return { error: 'Файл без розширення не підтримується' };

  const kind = detectFileKind(ext);
  const rule = TALENT_MEDIA_RULES[kind];
  if (!rule.exts.includes(ext)) return { error: `Формат .${ext} не підтримується` };
  if (file.size > rule.maxSize) {
    return { error: `${rule.label}: максимальний розмір ${formatFileSize(rule.maxSize)}` };
  }

  const id = crypto.randomUUID();
  const base = safeNamePart(translit(file.name.replace(/\.[^.]+$/, '')), 30) || 'file';
  const storagePath = `team-${teamNumber}/${id}_${base}.${ext}`;

  const { error } = await supabase.storage.from(TALENT_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { error: 'Не вдалося завантажити файл у сховище' };

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

/** Фізичне видалення файлу зі сховища */
export async function removeTalentFile(storagePath: string): Promise<void> {
  await supabase.storage.from(TALENT_BUCKET).remove([storagePath]);
}

/** Збереження масиву прикріплень у заявці */
export async function persistAttachments(entryId: string, attachments: TalentAttachment[]) {
  return supabase
    .from('talent_entries')
    .update({ attachments: attachments as unknown as never })
    .eq('id', entryId);
}
