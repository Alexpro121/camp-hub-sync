import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, Copy, PencilLine } from 'lucide-react';
import { toast } from 'sonner';

export interface AiErrorInfo {
  code?: string;
  status?: number;
  model?: string;
  message?: string;
  raw?: string;
  reason?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  info: AiErrorInfo | null;
  onFallback: () => void;
}

const buildLog = (i: AiErrorInfo) =>
  [
    '=== GROQ AI SCHEDULE PARSER DIAGNOSTICS ===',
    `time:    ${new Date().toISOString()}`,
    `code:    ${i.code ?? '—'}`,
    `reason:  ${i.reason ?? '—'}`,
    `status:  ${i.status ?? '—'}`,
    `model:   ${i.model ?? 'llama-3.3-70b-versatile (Groq)'}`,
    `message: ${i.message ?? '—'}`,
    '--- raw response (first 300 chars) ---',
    i.raw || '(empty)',
  ].join('\n');

const AIErrorDialog = ({ open, onOpenChange, info, onFallback }: Props) => {
  const [copied, setCopied] = useState(false);
  if (!info) return null;
  const log = buildLog(info);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(log);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = log;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Скопійовано!');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            Не вдалося авто-розпізнати розклад через ШІ
          </DialogTitle>
          <DialogDescription className="text-xs">
            Система автоматично переключилася на резервний алгоритм, але ви можете скопіювати детальну помилку для
            розробників.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-surface-1 border border-border/50 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Код</p>
              <p className="font-bold break-all">{info.code ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-surface-1 border border-border/50 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">HTTP</p>
              <p className="font-bold">{info.status ?? '—'}</p>
            </div>
          </div>
          <div className="rounded-lg bg-surface-1 border border-border/50 p-2 text-xs">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Повідомлення Groq API</p>
            <p className="break-words">{info.message || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Сира відповідь (300 симв.)</p>
            <pre className="font-mono text-xs bg-muted p-3 rounded max-h-40 overflow-auto whitespace-pre-wrap break-all">
              {info.raw || '(порожньо)'}
            </pre>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button onClick={copy} variant="secondary" className="h-11 text-xs font-bold uppercase">
            {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
            📋 Скопіювати текст помилки
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onFallback();
            }}
            className="h-11 text-xs font-bold uppercase"
          >
            <PencilLine className="w-4 h-4 mr-1.5" /> Відкрити резервний редактор
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIErrorDialog;