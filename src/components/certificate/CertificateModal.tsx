import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Award, 
  Download, 
  Pencil, 
  Loader2, 
  AlertCircle, 
  FileText,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/useHaptics';
import { 
  validateCertificateName, 
  generatePersonalizedPdf 
} from '@/lib/certificate';

interface Props {
  open: boolean;
  onClose: () => void;
  initialName: string;
}

export const CertificateModal = ({ open, onClose, initialName }: Props) => {
  const [name, setName] = useState(initialName);
  const [editMode, setEditMode] = useState(false);
  const [tempName, setTempName] = useState(initialName);
  const [pdfData, setPdfData] = useState<{ pdfBlob: Blob; pdfUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const haptics = useHaptics();

  // Генерація персоналізованого PDF
  const createPdf = useCallback(async (targetName: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePersonalizedPdf(targetName);
      setPdfData(result);
    } catch (err) {
      console.error(err);
      setError('Не вдалося згенерувати PDF-сертифікат. Перевірте наявність файлу бланка.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      createPdf(name);
    }
  }, [open, name, createPdf]);

  // Застосування виправленого імені
  const handleApplyName = async () => {
    const validation = validateCertificateName(initialName, tempName);
    if (!validation.ok) {
      haptics.notification('error');
      setError(validation.error || 'Помилка валідації');
      return;
    }

    haptics.notification('success');
    setError(null);
    const validName = tempName.trim();
    setName(validName);
    setEditMode(false);
    await createPdf(validName);
    toast.success('Ім’я в сертифікаті оновлено');
  };

  // Пряме завантаження готового PDF-файлу
  const handleDownloadPdf = () => {
    if (!pdfData) return;
    haptics.impact('medium');

    const fileName = `Сертифікат_Залізна_Зміна_${name.replace(/\s+/g, '_')}.pdf`;
    const link = document.createElement('a');
    link.href = pdfData.pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('PDF-сертифікат успішно завантажено!');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-full p-4 sm:p-6 rounded-[32px] bg-card/95 backdrop-blur-2xl border-border/60 shadow-2xl select-none max-h-[94dvh] overflow-y-auto overscroll-contain">
        
        {/* Шапка */}
        <DialogHeader className="pb-2 border-b border-border/40">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Award className="w-4 h-4" strokeWidth={2.2} />
              </div>
              <span>Іменний сертифікат (PDF)</span>
            </DialogTitle>

            <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/25">
              СЕЗОН 2026
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-3.5 pt-2">
          
          {/* Прев'ю PDF-документа */}
          <div className="relative rounded-2xl overflow-hidden border border-border/60 bg-black/40 aspect-[16/11] flex items-center justify-center shadow-lg">
            {loading && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#FA5A15]" />
                <span className="text-[11px] text-muted-foreground font-mono">Генерація векторного PDF...</span>
              </div>
            )}

            {!loading && pdfData && (
              <iframe
                src={`${pdfData.pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                title="Сертифікат Залізна Зміна PDF"
                className="w-full h-full border-none rounded-2xl pointer-events-auto"
              />
            )}

            {error && (
              <div className="p-4 text-center text-xs text-destructive flex flex-col items-center gap-1.5">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Блок редагування імені */}
          {!editMode ? (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-1/50 border border-border/50">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">
                  Ім’я в сертифікаті:
                </span>
                <p className="text-sm font-bold text-foreground truncate">{name}</p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  haptics.impact('light');
                  setTempName(name);
                  setEditMode(true);
                }}
                className="h-8 px-2.5 rounded-xl border-border/60 text-xs font-semibold gap-1 shrink-0"
              >
                <Pencil className="w-3 h-3 text-[#FA5A15]" />
                <span>Змінити</span>
              </Button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-surface-1/70 border border-border/60 space-y-2.5 animate-fade-in">
              <Label className="text-xs font-semibold text-foreground">
                Виправити ім'я на бланку:
              </Label>
              <Input
                value={tempName}
                onChange={(e) => {
                  setTempName(e.target.value);
                  setError(null);
                }}
                className="h-10 text-sm bg-background border-border/60 rounded-xl"
                placeholder="Прізвище Ім'я По батькові"
              />

              {error && (
                <div className="flex items-start gap-1.5 text-[11px] text-destructive font-medium leading-tight">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode(false)}
                  className="flex-1 h-9 rounded-xl text-xs"
                >
                  Скасувати
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyName}
                  className="flex-1 h-9 rounded-xl text-xs font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white"
                >
                  Застосувати
                </Button>
              </div>
            </div>
          )}

          {/* Головна кнопка скачування PDF */}
          <Button
            onClick={handleDownloadPdf}
            disabled={loading || !pdfData}
            className="w-full h-12 rounded-2xl font-bold bg-[#FA5A15] hover:bg-[#FF7D3B] text-white active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4 stroke-[2.2]" />
            <span>Завантажити PDF-сертифікат</span>
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CertificateModal;
