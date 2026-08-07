import { Card } from '@/components/ui/card';
import { Baby, ShieldCheck, Cog } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import type { Screen } from '@/pages/Index';

interface Props {
  onSelect: (s: Screen) => void;
}

const RoleSelect = ({ onSelect }: Props) => {
  const haptics = useHaptics();
  const pick = (s: Screen) => { haptics.impact('light'); onSelect(s); };
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-5 py-6 safe-top safe-bottom overflow-x-hidden">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <Cog className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
            <span className="text-xs font-semibold tracking-wider uppercase text-primary">Help_Супровід</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight mb-2 leading-none bg-gradient-to-r from-foreground via-foreground/80 to-primary bg-clip-text text-transparent">
            Обери роль
          </h1>
          <p className="text-muted-foreground text-sm mb-5">Система управління командами табору</p>

          <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-border/60 bg-muted/40">
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              Specially for Iron Squad
            </span>
          </div>
        </div>

        <div className="grid gap-4 stagger">
          <Card
            onClick={() => pick('supervisor')}
            className="group p-6 min-h-[88px] bg-card/60 hover:bg-card/85 backdrop-blur-md border border-border/60 hover:border-primary/40 cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] shine"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-glow group-hover:scale-110 transition-spring">
                <ShieldCheck className="w-7 h-7 text-primary-foreground" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold tracking-tight">Я супровід</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Керування командою</p>
              </div>
            </div>
          </Card>

          <Card
            onClick={() => pick('child')}
            className="group p-6 min-h-[88px] bg-card/60 hover:bg-card/85 backdrop-blur-md border border-border/60 hover:border-primary/40 cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] shine"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-secondary border border-primary/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-spring">
                <Baby className="w-7 h-7 text-primary" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold tracking-tight">Я дитина</h2>
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
