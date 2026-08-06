import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Baby, ShieldCheck, Sparkles } from 'lucide-react';
import type { Screen } from '@/pages/Index';

interface Props {
  onSelect: (s: Screen) => void;
}

const RoleSelect = ({ onSelect }: Props) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 safe-top safe-bottom">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold tracking-wider uppercase text-primary">Help_Супровід</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight mb-3 leading-none">
            Обери <span className="text-gradient-primary">роль</span>
          </h1>
          <p className="text-muted-foreground text-sm mb-5">Система управління командами табору</p>

          <div className="relative inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-gradient-card border border-primary/30 shadow-glow shine overflow-hidden">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span className="text-sm font-bold italic tracking-wide text-gradient-primary" style={{ fontFamily: "'Inter', serif" }}>
              Specially for Iron Squad
            </span>
            <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
          </div>
        </div>

        <div className="grid gap-4 stagger">
          <Card
            onClick={() => onSelect('supervisor')}
            className="group p-6 bg-gradient-card border-border/50 cursor-pointer hover:border-primary/60 transition-smooth hover:shadow-glow active:scale-[0.98] shine"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-spring">
                <ShieldCheck className="w-7 h-7 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold uppercase tracking-tight">Я супровід</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Керування командою</p>
              </div>
            </div>
          </Card>

          <Card
            onClick={() => onSelect('child')}
            className="group p-6 bg-gradient-card border-border/50 cursor-pointer hover:border-primary/60 transition-smooth hover:shadow-glow active:scale-[0.98] shine"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:-rotate-3 transition-spring">
                <Baby className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold uppercase tracking-tight">Я дитина</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Мій профіль і Айрон Долари</p>
              </div>
            </div>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground/60 mt-10">
          v1.0 · реальний час · збереження автоматичне
        </p>
        <p className="text-center text-[11px] text-muted-foreground/50 mt-3 tracking-wider">
          Created by <span className="font-semibold text-primary/70">Alex</span> & <span className="font-semibold text-primary/70">Bodya</span>
        </p>
      </div>
    </div>
  );
};

export default RoleSelect;
