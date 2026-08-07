import { useState, type KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Props {
  value: number[];
  onChange: (teams: number[]) => void;
  placeholder?: string;
}

/** Fully dynamic team chips — any number the admin types is accepted. */
const TeamTagInput = ({ value, onChange, placeholder = 'Введи номер і натисни Enter' }: Props) => {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const nums = raw
      .split(/[,;\s]+/)
      .flatMap((chunk) => {
        const range = chunk.match(/^(\d{1,4})[-–](\d{1,4})$/);
        if (range) {
          const a = parseInt(range[1], 10);
          const b = parseInt(range[2], 10);
          return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i);
        }
        const n = parseInt(chunk.replace(/\D/g, ''), 10);
        return Number.isFinite(n) && n > 0 ? [n] : [];
      });
    if (!nums.length) return;
    onChange([...new Set([...value, ...nums])].sort((a, b) => a - b));
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Команди ще не вказані</span>
        )}
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold tabular-nums"
          >
            №{t}
            <button
              type="button"
              aria-label={`Прибрати команду ${t}`}
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="w-3 h-3" strokeWidth={2.2} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={placeholder}
          className="h-11"
        />
        <button
          type="button"
          onClick={() => commit(draft)}
          className="h-11 px-3 rounded-md border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Додати команду"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export default TeamTagInput;
