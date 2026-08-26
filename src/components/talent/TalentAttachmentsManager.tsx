import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
  Sparkles,
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
  /** Викликається після будь-якої зміни списку */
  onChange: (next: TalentAttachment[]) => void | Promise<void>;
  disabled?: boolean;
}

const KIND_META: Record<TalentFileKind, { icon: typeof Music2; color: string; bg: string }> = {
  audio: { icon: Music2, color: 'text-[#FA5A15]', bg: 'bg-[#FA5A15]/15 border-[#FA5A15]/30' },
  image: { icon: ImageIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  video: { icon: Video, color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/30' },
  doc: { icon: FileText, color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30' },
};

/** Інтерактивний менеджер медіафайлів номера: завантаження, інлайн-перейменування, видалення, прев'ю */
const TalentAttachmentsManager: React.FC<Props> = ({ 
  teamNumber, 
  attachments, 
  onChange, 
  disabled = false 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const haptics = useHaptics();

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string; kind: TalentFileKind } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Очищення аудіо при демонтажі
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const pick = (file: File | null) => {
    if (!file) return;
    haptics.impact('light');
    setPendingFile(file);
    setPendingLabel('');
  };

  const doUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    const { attachment, error } = await uploadTalentFile(pendingFile, teamNumber, pendingLabel);
    setUploading(false);

    if (error || !attachment) { 
      haptics.notification('error');
      toast.error(error || 'Не вдалося завантажити файл'); 
      return; 
    }

    haptics.notification('success');
    setPendingFile(null);
    setPendingLabel('');
    if (inputRef.current) inputRef.current.value = '';
    await onChange([...attachments, attachment]);
    toast.success(`Файл «${attachment.label}» прикріплено`);
  };

  const saveRename = async (att: TalentAttachment) => {
    const label = renameValue.trim();
    if (!label) { 
      toast.error('Назва не може бути порожньою'); 
      return; 
    }
    haptics.impact('light');
    setRenamingId(null);
    await onChange(attachments.map((a) => (a.id === att.id ? { ...a, label } : a)));
    toast.success('Назву файлу оновлено');
  };

  const doRemove = async (att: TalentAttachment) => {
    // Зупиняємо аудіо, якщо воно грало
    if (playingId === att.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }

    setRemovingId(att.id);
    await removeTalentFile(att.storagePath);
    await onChange(attachments.filter((a) => a.id !== att.id));
    setRemovingId(null);
    haptics.notification('warning');
    toast.success('Файл видалено');
  };

  const togglePlay = async (att: TalentAttachment) => {
    haptics.impact('light');
    if (playingId === att.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
    if (!url) { 
      toast.error('Не вдалося відкрити аудіофайл'); 
      return; 
    }

    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(att.id);
    
    audio.play().catch(() => { 
      setPlayingId(null); 
      toast.error('Помилка відтворення аудіо'); 
    });
  };

  const openPreview = async (att: TalentAttachment) => {
    haptics.impact('light');
    const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
    if (!url) { 
      toast.error('Не вдалося відкрити файл'); 
      return; 
    }
    setPreview({ url, label: att.label, kind: att.fileType });
  };

  return (
    <div className="space-y-3 select-none">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Медіафайли номера
        </Label>
        <span className="text-[11px] text-slate-400 font-mono font-semibold">
          {attachments.length} {attachments.length === 1 ? 'файл' : 'файлів'}
        </span>
      </div>

      {/* Список прикріплених файлів */}
      <div className="space-y-2">
        {attachments.map((att) => {
          const meta = KIND_META[att.fileType] ?? KIND_META.doc;
          const Icon = meta.icon;
          const isRenaming = renamingId === att.id;

          return (
            <div
              key={att.id}
              className="rounded-2xl border border-white/10 bg-[#0F1523]/85 backdrop-blur-xl p-3 flex items-center gap-3 transition-all"
            >
              {/* Іконка типу медіа */}
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${meta.bg}`}>
                <Icon className={`w-5 h-5 ${meta.color}`} strokeWidth={1.9} />
              </div>

              {/* Назва та інформація про файл */}
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(att);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                      className="h-10 text-xs bg-black/40 border-white/20 text-white rounded-xl"
                      placeholder="Призначення файлу"
                    />
                    <span className="text-[10px] font-mono font-bold px-2 py-1.5 rounded-lg bg-white/5 text-slate-400 border border-white/10 shrink-0 uppercase">
                      .{att.fileExt}
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                      {att.label}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      <span className="font-mono font-bold text-[#FA5A15] uppercase">.{att.fileExt}</span> · {formatFileSize(att.fileSize)} · {att.fileName}
                    </p>
                  </>
                )}
              </div>

              {/* Кнопки дій */}
              <div className="flex items-center gap-1 shrink-0">
                {isRenaming ? (
                  <>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-10 h-10 rounded-xl text-emerald-400 hover:bg-emerald-500/10 active:scale-90" 
                      onClick={() => saveRename(att)} 
                      aria-label="Зберегти назву"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-10 h-10 rounded-xl text-slate-400 hover:bg-white/10 active:scale-90" 
                      onClick={() => setRenamingId(null)} 
                      aria-label="Скасувати"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Кнопка запуску аудіо */}
                    {att.fileType === 'audio' && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className={`w-10 h-10 rounded-xl transition-all active:scale-90 ${
                          playingId === att.id 
                            ? 'bg-[#FA5A15] text-white shadow-md animate-pulse' 
                            : 'hover:bg-white/10 text-[#FA5A15]'
                        }`} 
                        onClick={() => togglePlay(att)} 
                        aria-label="Прослухати трек"
                      >
                        {playingId === att.id ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                      </Button>
                    )}

                    {/* Кнопка прев'ю зображення/відео */}
                    {(att.fileType === 'image' || att.fileType === 'video') && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="w-10 h-10 rounded-xl text-emerald-400 hover:bg-emerald-500/10 active:scale-90" 
                        onClick={() => openPreview(att)} 
                        aria-label="Переглянути медіа"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                    )}

                    {!disabled && (
                      <>
                        {/* Перейменувати лейбл */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-10 h-10 rounded-xl text-slate-300 hover:bg-white/10 active:scale-90"
                          onClick={() => { 
                            haptics.impact('light');
                            setRenamingId(att.id); 
                            setRenameValue(att.label); 
                          }}
                          aria-label="Перейменувати призначення"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>

                        {/* Видалити файл */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-10 h-10 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 active:scale-90"
                          disabled={removingId === att.id}
                          onClick={() => {
                            if (window.confirm(`Видалити файл «${att.label}»?`)) {
                              doRemove(att);
                            }
                          }}
                          aria-label="Видалити файл"
                        >
                          {removingId === att.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
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

      {/* Форма завантаження нового файлу */}
      {!disabled && (
        <div className="space-y-2 pt-1">
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
              className="w-full min-h-[44px] rounded-2xl text-xs font-bold uppercase border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 shadow-sm active:scale-[0.98] transition-all"
            >
              <Upload className="w-4 h-4 mr-2 text-[#FA5A15]" /> 
              <span>Прикріпити трек / медіа</span>
            </Button>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-[#0F1523]/90 backdrop-blur-xl p-4 space-y-3 shadow-xl animate-slide-up">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-[#FA5A15] tracking-widest flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Новий файл
                </span>
                <span className="text-[11px] font-mono text-slate-400">{formatFileSize(pendingFile.size)}</span>
              </div>

              <p className="text-xs text-slate-200 font-semibold truncate bg-white/5 p-2 rounded-xl border border-white/5">
                {pendingFile.name}
              </p>

              <Label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Оберіть або вкажіть призначення:
              </Label>

              {/* Пресети призначення */}
              <div className="flex flex-wrap gap-1.5">
                {LABEL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { 
                      haptics.selection(); 
                      setPendingLabel(preset); 
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                      pendingLabel === preset
                        ? 'bg-[#FA5A15] text-white border-[#FA5A15] shadow-[0_0_12px_rgba(250,90,21,0.35)]'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <Input
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                placeholder="Власний варіант, напр. «Мінус з бек-вокалом»"
                className="h-11 text-xs bg-black/40 border-white/10 text-white rounded-xl"
              />

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1 min-h-[44px] text-xs font-bold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  onClick={() => { 
                    setPendingFile(null); 
                    if (inputRef.current) inputRef.current.value = ''; 
                  }}
                >
                  Скасувати
                </Button>
                <Button
                  type="button"
                  onClick={doUpload}
                  disabled={uploading}
                  className="flex-1 min-h-[44px] text-xs font-bold uppercase rounded-xl bg-[#FA5A15] hover:bg-[#FF7D3B] text-white shadow-md active:scale-95 transition-all"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="w-4 h-4 mr-1.5" />
                  )}
                  <span>Завантажити</span>
                </Button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-500 px-1 leading-relaxed">
            Аудіо до 35 МБ (mp3, wav, m4a) · Зображення до 15 МБ (jpg, png, webp) · Відео до 60 МБ (mp4, mov)
          </p>
        </div>
      )}

      {/* Повноекранне прев'ю медіа (Obsidian Lightbox) */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-2xl max-h-[85dvh] p-4 bg-[#07090E]/95 border border-white/10 rounded-3xl backdrop-blur-2xl z-50 overflow-hidden shadow-2xl focus:outline-none">
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <DialogTitle className="text-sm font-bold uppercase tracking-wider text-slate-100 truncate">
                  {preview.label}
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-center max-h-[65dvh] overflow-auto rounded-2xl bg-black/50 p-1">
                {preview.kind === 'video' ? (
                  <video src={preview.url} controls className="max-h-[60dvh] w-full rounded-xl" />
                ) : (
                  <img src={preview.url} alt={preview.label} className="max-h-[60dvh] w-auto max-w-full rounded-xl object-contain" />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TalentAttachmentsManager;
