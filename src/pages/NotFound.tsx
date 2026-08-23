import { useLocation, Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Compass, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: Користувач спробував перейти на неіснуючий маршрут:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 bg-background text-foreground relative overflow-hidden select-none">
      
      {/* М'яке фонове амбієнт-світло */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] sm:w-[600px] h-[450px] sm:h-[600px] bg-primary/[0.08] dark:bg-primary/[0.12] rounded-full blur-[130px]" />
      </div>

      {/* Головна картка 404 */}
      <div className="relative z-10 w-full max-w-md p-6 sm:p-8 rounded-3xl bg-card/85 backdrop-blur-xl border border-border/60 shadow-xl text-center space-y-5 animate-fade-in">
        
        {/* Іконка компаса з підсвічуванням */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-primary/15 border border-primary/25 flex items-center justify-center shadow-inner">
          <Compass className="w-8 h-8 sm:w-10 sm:h-10 text-primary animate-[spin_20s_linear_infinite]" strokeWidth={1.75} />
          <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl animate-pulse" />
        </div>

        {/* Заголовок та опис */}
        <div className="space-y-1.5">
          <span className="font-mono font-black text-4xl sm:text-5xl tracking-tight text-primary block leading-none">
            404
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Маршрут не знайдено
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1">
            Схоже, цей шлях або сектор хабу не існують, чи були переміщені на іншу колію.
          </p>
        </div>

        {/* Неіснуючий шлях */}
        <div className="p-2.5 rounded-xl bg-surface-1/60 border border-border/40 font-mono text-[11px] text-muted-foreground truncate">
          <span className="text-primary font-bold">path:</span> {location.pathname}
        </div>

        {/* Кнопки дій */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="w-full sm:w-1/2 h-11 text-xs font-semibold border-border/60 hover:bg-muted/40 active:scale-[0.98] transition-all gap-1.5"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            <span>Назад</span>
          </Button>

          <Button
            asChild
            className="w-full sm:w-1/2 h-11 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground active:scale-[0.98] transition-all shadow-md gap-1.5"
          >
            <Link to="/">
              <Home className="w-4 h-4" />
              <span>На головну</span>
            </Link>
          </Button>
        </div>

      </div>

    </div>
  );
};

export default NotFound;
