import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  Music2,
  Pause,
  Pencil,
  Play,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/useHaptics';
import type { TalentAttachment, TalentFileKind } from '@/types/app';
import {
  LABEL_PRESETS,
  TALENT_ACCEPT,
  formatFileSize,
  getSignedUrl,
  removeTalentFile,
  uploadTalentFile,
} from '@/lib/talentMedia';

interface Props {
  teamNumber: number;
  attachments: TalentAttachment[];
  /** Викликається після будь-якої зміни списку — компонент не пише в базу сам */
  onChange: (next: TalentAttachment[]) => void | Promise<void>;
  disabled?: boolean;
}

const KIND_ICON: Record<TalentFileKind, typeof Music2> = {
  audio: Music2,
  image: ImageIcon,
  video: Video,
  doc: FileText,
};

/** Інтерактивний менеджер медіафайлів номера: завантаження, перейменування, видалення, прев'ю */
const TalentAttachmentsManager = ({ teamNumber, attachments, onChange, disabled = false }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const haptics = useHaptics();

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const pick = (file: File | null) => {
    if (!file) return;
    setPendingFile(file);
    setPendingLabel('');
  };

  const doUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    const { attachment, error } = await uploadTalentFile(pendingFile, teamNumber, pendingLabel);
    setUploading(false);
    if (error || !attachment) { toast.error(error || 'Не вдалося завантажити файл'); return; }
    haptics.notification('success');
    setPendingFile(null);
    setPendingLabel('');
    if (inputRef.current) inputRef.current.value = '';
    await onChange([...attachments, attachment]);
    toast.success('Файл прикріплено');
  };

  const saveRename = async (att: TalentAttachment) => {
    const label = renameValue.trim();
    if (!label) { toast.error('Назва не може бути порожньою'); return; }
    setRenamingId(null);
    await onChange(attachments.map((a) => (a.id === att.id ? { ...a, label } : a)));
    toast.success('Назву файлу оновлено');
  };

  const doRemove = async (att: TalentAttachment) => {
    setRemovingId(att.id);
    await removeTalentFile(att.storagePath);
    await onChange(attachments.filter((a) => a.id !== att.id));
    setRemovingId(null);
    haptics.notification('warning');
    toast.success('Файл видалено');
  };

  const togglePlay = async (att: TalentAttachment) => {
    if (playingId === att.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
    if (!url) { toast.error('Не вдалося відкрити файл'); return; }
    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(att.id);
    audio.play().catch(() => { setPlayingId(null); toast.error('Відтворення недоступне'); });
  };

  const openPreview = async (att: TalentAttachment) => {
    const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
    if (!url) { toast.error('Не вдалося відкрити файл'); return; }
    setPreview({ url, label: att.label });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">Медіафайли номера</Label>
        <span className="text-[10px] text-muted-foreground font-mono">{attachments.length} файл(ів)</span>
      </div>

      {/* Список прикріплених файлів */}
      <div className="space-y-2">
        {attachments.map((att) => {
          const Icon = KIND_ICON[att.fileType] ?? FileText;
          const isRenaming = renamingId === att.id;
          return (
            <div
              key={att.id}
              className="rounded-2xl border border-white/10 bg-[#0F1523]/80 p-2.5 flex items-center gap-2"
            >
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-[#FA5A15]" />
              </div>

              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                      className="h-9 text-xs bg-black/30 border-white/10"
                      placeholder="Призначення файлу"
                    />
                    <span className="text-[10px] font-mono px-1.5 py-1 rounded-md bg-white/5 text-muted-foreground border border-white/10 shrink-0">
                      .{att.fileExt}
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-100 truncate">{att.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      <span className="font-mono uppercase">.{att.fileExt}</span> · {formatFileSize(att.fileSize)} · {att.fileName}
                    </p>
                  </>
                )}
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {isRenaming ? (
                  <>
                    <Button size="icon" variant="ghost" className="w-9 h-9" onClick={() => saveRename(att)} aria-label="Зберегти назву">
                      <Check className="w-4 h-4 text-emerald-400" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-9 h-9" onClick={() => setRenamingId(null)} aria-label="Скасувати">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    {att.fileType === 'audio' && (
                      <Button size="icon" variant="ghost" className="w-9 h-9" onClick={() => togglePlay(att)} aria-label="Прослухати">
                        {playingId === att.id ? <Pause className="w-4 h-4 text-[#FA5A15]" /> : <Play className="w-4 h-4 text-[#FA5A15]" />}
                      </Button>
                    )}
                    {(att.fileType === 'image' || att.fileType === 'video') && (
                      <Button size="icon" variant="ghost" className="w-9 h-9" onClick={() => openPreview(att)} aria-label="Переглянути">
                        <ImageIcon className="w-4 h-4 text-[#FA5A15]" />
                      </Button>
                    )}
                    {!disabled && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-9 h-9"
                          onClick={() => { setRenamingId(att.id); setRenameValue(att.label); }}
                          aria-label="Перейменувати"
                        >
                          <Pencil className="w-4 h-4 text-slate-300" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-9 h-9"
                          disabled={removingId === att.id}
                          onClick={() => {
                            if (window.confirm(`Видалити файл «${att.label}»?`)) doRemove(att);
                          }}
                          aria-label="Видалити"
                        >
                          {removingId === att.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4 text-destructive" />}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Форма завантаження */}
      {!disabled && (
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={TALENT_ACCEPT}
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />

          {!pendingFile ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              className="w-full h-11 text-xs font-bold uppercase border-white/10 bg-white/5 hover:bg-white/10"
            >
              <Upload className="w-4 h-4 mr-1.5 text-[#FA5A15]" /> Прикріпити файл
            </Button>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#0F1523]/80 p-3 space-y-2.5">
              <p className="text-[11px] text-muted-foreground truncate">
                Обрано: <span className="text-slate-100 font-semibold">{pendingFile.name}</span> · {formatFileSize(pendingFile.size)}
              </p>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Вкажіть призначення файлу</Label>
              <div className="flex flex-wrap gap-1.5">
                {LABEL_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { haptics.selection(); setPendingLabel(p); }}
                    className={`px-2.5 h-8 rounded-full text-[11px] font-semibold border transition-smooth ${
                      pendingLabel === p
                        ? 'bg-[#FA5A15] text-white border-[#FA5A15]'
                        : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Input
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                placeholder="Або свій варіант, напр. «Мінус з приспівом»"
                className="h-11 text-xs bg-black/30 border-white/10"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 h-11 text-xs font-bold uppercase"
                  onClick={() => { setPendingFile(null); if (inputRef.current) inputRef.current.value = ''; }}
                >
                  Скасувати
                </Button>
                <Button
                  type="button"
                  onClick={doUpload}
                  disabled={uploading}
                  className="flex-1 h-11 text-xs font-bold uppercase bg-[#FA5A15] hover:bg-[#FA5A15]/90 text-white"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4 mr-1.5" /> Завантажити</>}
                </Button>
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Аудіо до 35 МБ (mp3, wav, m4a) · Зображення до 15 МБ (jpg, png, webp) · Відео до 60 МБ (mp4, mov)
          </p>
        </div>
      )}

      {/* Повноекранне прев'ю */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] max-w-3xl max-h-[90dvh] p-3 bg-[#07090E]/95 border border-white/10 rounded-3xl overflow-auto z-50">
          {preview && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-slate-100">{preview.label}</p>
              {/\.(mp4|mov)(\?|$)/i.test(preview.url.split('?')[0]) ? (
                <video src={preview.url} controls className="w-full rounded-2xl" />
              ) : (
                <img src={preview.url} alt={preview.label} className="w-full rounded-2xl object-contain" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TalentAttachmentsManager;
