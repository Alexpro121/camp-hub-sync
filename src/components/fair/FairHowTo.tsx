import { useState } from "react";
import { 
  Lightbulb, 
  ShoppingBag, 
  Radio, 
  CheckCircle2, 
  Store, 
  UserCheck, 
  Coins, 
  X, 
  Info,
  Send,
  Sparkles
} from "lucide-react";

interface Props {
  variant: "child" | "supervisor";
  className?: string;
}

// Покрокові інструкції для дітей (Air Pay)
const CHILD_STEPS = [
  { 
    Icon: ShoppingBag, 
    text: "Обирай товари або смаколики на ярмаркових наметах табору." 
  },
  {
    Icon: Send,
    text: "У кабінеті вкажи суму, перевір номер каси команди та натисни «Надіслати запит на касу».",
  },
  { 
    Icon: CheckCircle2, 
    text: "Супровід миттєво підтвердить оплату на своєму екрані — забирай покупку та переглядай чек в історії!" 
  },
];

// Покрокові інструкції для супроводу (Air Pay Каса)
const SUP_STEPS = [
  { 
    Icon: Store, 
    text: "Тримай касу відкритою — діти надсилають запити на оплату зі своїх телефонів прямо по повітрю." 
  },
  { 
    Icon: Radio, 
    text: "У блоці «Вхідні запити» з'явиться ім'я дитини та сума. Натисни «Списати», щоб провести оплату за 1 секунду." 
  },
  {
    Icon: UserCheck,
    text: "Якщо у дитини розрядився телефон — скористайся блоком «Пряме списання» та обери її зі списку своєї команди.",
  },
];

const TIP = {
  child:
    "Рахуй загальну суму покупок і надсилай один запит за все разом (наприклад, лимонад + смаколики). Це значно швидше та зручніше!",
  supervisor:
    "Ви можете увімкнути перемикач «Дозволити покупки іншим командам», щоб приймати оплату від усіх учасників табору.",
};

/**
 * Інтерактивна інструкція Air Pay для ярмарку.
 */
const FairHowTo = ({ variant, className = "" }: Props) => {
  const steps = variant === "child" ? CHILD_STEPS : SUP_STEPS;
  const title = variant === "child" ? "Як купувати на ярмарку (Air Pay)?" : "Як працює каса Air Pay?";
  const storageKey = `fair-howto-hidden:${variant}`;
  
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const setState = (next: boolean) => {
    setHidden(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  // Згорнутий стан (акуратна кнопка)
  if (hidden) {
    return (
      <div className={`relative z-10 flex justify-end select-none ${className}`}>
        <button
          type="button"
          onClick={() => setState(false)}
          aria-label={title}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all shadow-sm"
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2} />
          <span>Інструкція</span>
        </button>
      </div>
    );
  }

  // Розгорнутий стан
  return (
    <div className={`rounded-3xl border border-amber-500/30 bg-amber-500/[0.06] dark:bg-amber-500/[0.04] backdrop-blur-md p-4 sm:p-5 select-none transition-all ${className}`}>
      
      {/* Шапка інструкції */}
      <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
            <Radio className="h-3.5 w-3.5 animate-pulse" strokeWidth={2.2} />
          </div>
          <p className="text-xs sm:text-sm font-bold tracking-tight text-amber-200">
            {title}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setState(true)}
          aria-label="Закрити інструкцію"
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold text-amber-200/90 hover:bg-amber-500/20 active:scale-95 transition-all"
        >
          <X className="h-3 w-3" strokeWidth={2.4} /> 
          <span>Приховати</span>
        </button>
      </div>

      {/* Крок 1 */}
      <ol className="mt-3 space-y-2.5">
        {steps.slice(0, 1).map(({ Icon, text }, i) => (
          <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-amber-100/90">
            <div className="w-5 h-5 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <span>
              <strong className="font-bold text-amber-300">Крок 1:</strong> {text}
            </span>
          </li>
        ))}
      </ol>

      {/* Важлива порада */}
      <div className="my-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200 shadow-inner">
        <span className="inline-flex items-center gap-1.5 font-black text-amber-300 uppercase tracking-wider text-[10px] block mb-0.5">
          <Lightbulb className="h-3.5 w-3.5 text-amber-400" strokeWidth={2.2} /> 
          Корисна порада:
        </span>
        <p className="text-amber-100/90 font-medium">
          {TIP[variant]}
        </p>
      </div>

      {/* Кроки 2 і 3 */}
      <ol className="space-y-2.5">
        {steps.slice(1).map(({ Icon, text }, i) => (
          <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-amber-100/90">
            <div className="w-5 h-5 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <span>
              <strong className="font-bold text-amber-300">Крок {i + 2}:</strong> {text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default FairHowTo;
