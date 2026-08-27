import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Music2,
  Package,
  Pause,
  Play,
  SlidersHorizontal,
  Video,
  Volume2,
  Search,
  X,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { TalentAttachment, TalentEntry, TalentFileKind } from '@/types/app';
import {
  buildStageFileName,
  buildZipFileName,
  buildZipFolderName,
  formatFileSize,
  getSignedUrl,
  parseAttachments,
} from '@/lib/talentMedia';

const SESSION_KEY = 'ironshift:stage-console-access';

const KIND_ICON: Record<TalentFileKind, typeof Music2> = {
  audio: Music2,
  image: ImageIcon,
  video: Video,
  doc: FileText,
};

function actsWord(count: number): string {
  const abs = Math.abs(count) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return `${count} виступів`;
  if (rem > 1 && rem < 5) return `${count} виступи`;
  if (rem === 1) return `${count} виступ`;
  return `${count} виступів`;
}

/** Пульт сцени для звукорежисера та світловика (публічний доступ за паролем) */
const StageConsole = () => {
  const [params] = useSearchParams();
  const shiftId = params.get('shift');

  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<TalentEntry[]>([]);
  const [eventTitle, setEventTitle] = useState('Вечір талантів');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  // Стейт аудіоплеєра
  const [playing, setPlaying] = useState<{ id: string; label: string; actTitle: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Стейт прев'ю зображення/відео
  const [previewMedia, setPreviewMedia] = useState<{ url: string; label: string; kind: TalentFileKind } | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { scope: string; password: string };
      if (parsed.scope === (shiftId || 'global') && parsed.password) {
        setPassword(parsed.password);
        setUnlocked(true);
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [shiftId]);

  const load = useCallback(async (pwd?: string) => {
    const pass = (pwd ?? password).trim();
    if (!pass) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_stage_console_data', {
      p_shift_id: shiftId,
      p_password: pass,
    });
    setLoading(false);
    const payload = data as { status?: string; event?: { title?: string } | null; entries?: unknown[] } | null;
    if (error || !payload || payload.status !== 'ok') {
      if (payload?.status === 'unauthorized') {
        sessionStorage.removeItem(SESSION_KEY);
        setUnlocked(false);
        toast.error('Невірний пароль сцени');
      }
      return;
    }
    setEventTitle(payload.event?.title || 'Вечір талантів');
    setEntries((payload.entries || []) as unknown as TalentEntry[]);
  }, [shiftId, password]);

  useEffect(() => {
    if (!unlocked) return;
    load();
    const ch = supabase
      .channel('stage-console')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talent_entries' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [unlocked, load]);

  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const unlock = async () => {
    const pass = password.trim();
    if (!pass) return;
    setChecking(true);
    const { data, error } = await supabase.rpc('get_stage_console_data', {
      p_shift_id: shiftId,
      p_password: pass,
    });
    setChecking(false);
    const payload = data as { status?: string; event?: { title?: string } | null; entries?: unknown[] } | null;
    if (error || !payload || payload.status !== 'ok') { toast.error('Невірний пароль сцени'); return; }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ scope: shiftId || 'global', password: pass }));
    setEventTitle(payload.event?.title || 'Вечір талантів');
    setEntries((payload.entries || []) as unknown as TalentEntry[]);
    setUnlocked(true);
  };


  /* ---------------------------- Аудіоплеєр ---------------------------- */
  const togglePlay = async (att: TalentAttachment, actTitle: string) => {
    if (playing?.id === att.id) {
      if (audioRef.current?.paused) { 
        audioRef.current.play(); 
      } else { 
        audioRef.current?.pause(); 
        setPlaying(null); 
      }
      return;
    }

    audioRef.current?.pause();
    const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
    if (!url) { toast.error('Файл недоступний для відтворення'); return; }
    
    const audio = new Audio(url);
    audio.volume = volume;
    audio.onloadedmetadata = () => setDuration(audio.duration || 0);
    audio.ontimeupdate = () => setProgress(audio.currentTime);
    audio.onended = () => { setPlaying(null); setProgress(0); };
    
    audioRef.current = audio;
    setPlaying({ id: att.id, label: att.label, actTitle });
    
    audio.play().catch(() => { 
      setPlaying(null); 
      toast.error('Браузер заблокував автовідтворення'); 
    });
  };

  const seek = (v: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = v;
    setProgress(v);
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(null);
    setProgress(0);
  };

  const fmtTime = (s: number) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  /* ---------------------- Прев'ю зображень / відео ---------------------- */
  const openMediaPreview = async (att: TalentAttachment) => {
    const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
    if (!url) { toast.error('Файл недоступний'); return; }
    setPreviewMedia({ url, label: att.label, kind: att.fileType });
  };

  /* ---------------------- Завантаження файлів ---------------------- */
  const downloadOne = async (entry: TalentEntry, index: number, att: TalentAttachment) => {
    const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
    if (!url) { toast.error('Файл недоступний'); return; }
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = buildStageFileName(index + 1, entry.team_number, entry.title, att);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success(`Завантажено: ${a.download}`);
    } catch {
      toast.error('Не вдалося завантажити файл');
    }
  };

  const programText = useMemo(() => {
    const lines = [`ПРОГРАМА ВИСТУПІВ — ${eventTitle}`, 'Всеукраїнський проєкт «Залізна Зміна»', ''];
    entries.forEach((e, i) => {
      const atts = parseAttachments(e.attachments);
      lines.push(`${String(i + 1).padStart(2, '0')}. Команда №${e.team_number} — ${e.title}`);
      if (e.description) lines.push(`    Учасники: ${e.description}`);
      if (e.technical_notes) lines.push(`    ⚠️ ТЕХНІЧНІ ПОБАЖАННЯ (ЗВУК/СВІТЛО): ${e.technical_notes}`);
      atts.forEach((a, ai) => lines.push(`    Файл ${ai + 1}: ${a.label} (${a.fileExt.toUpperCase()}, ${formatFileSize(a.fileSize)})`));
      const pause = e.pause_after ?? e.break_needed_after ?? 0;
      if (pause > 0) lines.push(`    ⏸ ПАУЗА ПІСЛЯ НОМЕРА: ${actsWord(pause)}`);
      lines.push('');
    });
    return lines.join('\n');
  }, [entries, eventTitle]);

  const downloadZip = async () => {
    setZipping(true);
    setZipProgress(0);
    try {
      const zip = new JSZip();
      const root = zip.folder('Вечір_Талантів_Програма')!;
      root.file('ПРОГРАМА_ВИСТУПІВ.txt', programText);

      const total = entries.reduce((acc, e) => acc + parseAttachments(e.attachments).length, 0);
      let done = 0;

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const atts = parseAttachments(e.attachments);
        if (!atts.length) continue;
        const folder = root.folder(buildZipFolderName(i + 1, e.team_number, e.title))!;
        
        for (let ai = 0; ai < atts.length; ai++) {
          const att = atts[ai];
          const url = (await getSignedUrl(att.storagePath)) || att.fileUrl;
          if (!url) continue;
          try {
            const res = await fetch(url);
            folder.file(buildZipFileName(ai + 1, att), await res.blob());
          } catch {
            /* пропускаємо файл при обриві */
          }
          done += 1;
          setZipProgress(total ? Math.round((done / total) * 100) : 100);
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Вечір_Талантів_Програма.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success('Архів з усіма медіафайлами сформовано!');
    } catch {
      toast.error('Помилка формування ZIP-архіву');
    } finally {
      setZipping(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase().trim();
    return entries.filter(
      (e) =>
        String(e.team_number).includes(q) ||
        e.title.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  /* ------------------------------ Екран входу ------------------------------ */
  if (!unlocked) {
    return (
      <main className="min-h-[100dvh] bg-[#07090E] text-slate-100 flex items-center justify-center px-4 select-none">
        <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0F1523]/90 backdrop-blur-2xl p-6 space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-[#FA5A15]" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black uppercase tracking-wide">Пульт сцени</h1>
            <p className="text-xs text-slate-400 mt-1">
              «Вечір талантів» · Всеукраїнський проєкт «Залізна Зміна». Введіть пароль доступу.
            </p>
          </div>
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value.toLowerCase())}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="напр. сцена.звук"
            className="h-12 bg-black/40 border-white/10 text-base text-center font-mono text-white rounded-xl"
          />
          <Button
            onClick={unlock}
            disabled={checking || !password.trim()}
            className="w-full h-12 bg-[#FA5A15] hover:bg-[#FF7D3B] text-white font-bold uppercase text-xs tracking-wider rounded-xl shadow-lg active:scale-95 transition-all"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Увійти на пульт'}
          </Button>
        </section>
      </main>
    );
  }

  /* ------------------------------ Головний Пульт ------------------------------ */
  return (
    <main className="min-h-[100dvh] bg-[#07090E] text-slate-100 px-3 sm:px-6 py-4 pb-44 select-none">
      <header className="max-w-4xl mx-auto space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#FA5A15]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>FOH & Сцена · Залізна Зміна</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wide truncate text-white mt-0.5">
              {eventTitle}
            </h1>
            <p className="text-xs text-slate-400">
              Пульт звукорежисера та світловика · {actsWord(entries.length)}
            </p>
          </div>

          <Button
            onClick={downloadZip}
            disabled={zipping || entries.length === 0}
            className="h-11 px-4 bg-[#FA5A15] hover:bg-[#FF7D3B] text-white font-bold uppercase text-xs tracking-wider rounded-xl shadow-md active:scale-95 transition-all shrink-0"
          >
            {zipping ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Архів… {zipProgress}%</>
            ) : (
              <><Package className="w-4 h-4 mr-2" /> Завантажити всі медіа (ZIP)</>
            )}
          </Button>
        </div>

        {/* Рядок швидкого пошуку */}
        {entries.length > 3 && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Швидкий пошук за номером команди чи назвою..."
              className="h-10 pl-9 text-xs rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
        )}
      </header>

      <section className="max-w-4xl mx-auto mt-4 space-y-3">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#FA5A15]" />
          </div>
        )}

        {!loading && filteredEntries.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-[#0F1523]/80 p-8 text-center text-sm text-slate-400">
            {searchQuery ? 'За вашим запитом виступів не знайдено.' : 'Програма виступів ще не сформована.'}
          </div>
        )}

        {filteredEntries.map((entry, i) => {
          const atts = parseAttachments(entry.attachments);
          const pause = entry.pause_after ?? entry.break_needed_after ?? 0;
          return (
            <div key={entry.id} className="space-y-2">
              <article className="rounded-3xl border border-white/10 bg-[#0F1523]/85 backdrop-blur-xl p-4 sm:p-5 shadow-xl transition-all">
                <div className="flex items-start gap-3.5">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#FA5A15] text-white flex items-center justify-center shrink-0 shadow-lg">
                    <span className="text-xl sm:text-2xl font-black font-mono tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-[11px] font-bold text-slate-200">
                        Команда №{entry.team_number}
                      </span>
                    </div>

                    <h2 className="text-base sm:text-lg font-black text-white leading-tight break-words mt-1">
                      {entry.title}
                    </h2>

                    {entry.description && (
                      <p className="text-xs text-slate-300 mt-1 break-words leading-relaxed">
                        Учасники: {entry.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Технічні побажання для звуку / світла */}
                {entry.technical_notes && (
                  <div className="mt-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5" /> 
                      <span>Технічні побажання (Світло / Звук)</span>
                    </p>
                    <p className="text-xs text-slate-100 mt-1 break-words whitespace-pre-wrap font-medium">
                      {entry.technical_notes}
                    </p>
                  </div>
                )}

                {/* Список прикріплених файлів */}
                {atts.length > 0 && (
                  <div className="mt-3.5 space-y-2">
                    {atts.map((att) => {
                      const Icon = KIND_ICON[att.fileType] ?? FileText;
                      const isPlaying = playing?.id === att.id;

                      return (
                        <div 
                          key={att.id} 
                          className="rounded-2xl border border-white/5 bg-black/40 p-2.5 px-3 flex items-center gap-2.5 hover:border-white/10 transition-colors"
                        >
                          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-[#FA5A15]" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-100 truncate">{att.label}</p>
                            <p className="text-[10px] text-slate-400 font-mono uppercase mt-0.5">
                              .{att.fileExt} · {formatFileSize(att.fileSize)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {att.fileType === 'audio' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className={`w-10 h-10 rounded-xl transition-all ${
                                  isPlaying ? 'bg-[#FA5A15] text-white shadow-md' : 'text-[#FA5A15] hover:bg-[#FA5A15]/15'
                                }`}
                                onClick={() => togglePlay(att, entry.title)}
                                aria-label={isPlaying ? 'Пауза' : 'Відтворити'}
                              >
                                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                              </Button>
                            )}

                            {(att.fileType === 'image' || att.fileType === 'video') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-10 h-10 rounded-xl text-emerald-400 hover:bg-emerald-500/10"
                                onClick={() => openMediaPreview(att)}
                                aria-label="Переглянути медіа"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-10 h-10 rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
                              onClick={() => downloadOne(entry, i, att)}
                              aria-label="Завантажити файл"
                              title="Завантажити з автоматичним іменем"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {atts.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-3 italic">Медіафайли не прикріплені (виступ наживо)</p>
                )}
              </article>

              {/* Пауза між номерами за регламентом */}
              {pause > 0 && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center shadow-inner">
                  <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                    ⏸️ Пауза: {actsWord(pause)} на перевдягання / підготовку реквізиту
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Повноекранне прев'ю фону / відео (Lightbox для світловика/VJ) */}
      <Dialog open={!!previewMedia} onOpenChange={(v) => !v && setPreviewMedia(null)}>
        <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-3xl max-h-[85dvh] p-4 bg-[#07090E]/95 border border-white/10 rounded-3xl backdrop-blur-2xl z-50 overflow-hidden shadow-2xl focus:outline-none">
          {previewMedia && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <DialogTitle className="text-xs font-bold uppercase tracking-wider text-slate-100 truncate">
                  {previewMedia.label}
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => setPreviewMedia(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-center max-h-[65dvh] overflow-auto rounded-2xl bg-black/60 p-1">
                {previewMedia.kind === 'video' ? (
                  <video src={previewMedia.url} controls className="max-h-[60dvh] w-full rounded-xl" />
                ) : (
                  <img src={previewMedia.url} alt={previewMedia.label} className="max-h-[60dvh] w-auto max-w-full rounded-xl object-contain" />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Нижній плаваючий FOH-аудіоплеєр */}
      {playing && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-[#0F1523]/95 backdrop-blur-2xl px-3 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl animate-slide-up">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                className="w-11 h-11 rounded-xl bg-[#FA5A15] hover:bg-[#FF7D3B] text-white shrink-0 shadow-md"
                onClick={() => {
                  if (!audioRef.current) return;
                  if (audioRef.current.paused) audioRef.current.play();
                  else audioRef.current.pause();
                  setProgress(audioRef.current.currentTime);
                }}
                aria-label="Пуск / пауза"
              >
                {audioRef.current?.paused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
              </Button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold truncate text-white">
                    <span className="text-[#FA5A15]">{playing.actTitle}</span> · {playing.label}
                  </p>
                  <button 
                    onClick={closePlayer}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                    title="Закрити плеєр"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">{fmtTime(progress)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={progress}
                    onChange={(e) => seek(Number(e.target.value))}
                    className="flex-1 accent-[#FA5A15] h-1.5 cursor-pointer bg-white/10 rounded-full"
                    aria-label="Перемотування"
                  />
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">{fmtTime(duration)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-14">
              <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="w-32 accent-[#FA5A15] h-1.5 cursor-pointer bg-white/10 rounded-full"
                aria-label="Гучність"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default StageConsole;
