import { useState } from "react";
import { Lightbulb, ShoppingBag, ScanLine, PartyPopper, QrCode, Coins, BadgeCheck, X, Info } from "lucide-react";

interface Props {
  variant: "child" | "supervisor";
  className?: string;
}

const CHILD_STEPS = [
  { Icon: ShoppingBag, text: "Обирай товари на стендах вожатих." },
  {
    Icon: ScanLine,
    text: "Натисни «Відкрити QR-сканер», наведи камеру на QR-код вожатого або введи 5-значний код з його екрана.",
  },
  { Icon: PartyPopper, text: "Отримуй підтвердження Iron Pay з чеком та конфеті!" },
];

const SUP_STEPS = [
  { Icon: Coins, text: "Вкажи суму покупки або вибери швидкий пресет (10, 20, 50 💰)." },
  { Icon: QrCode, text: "Покажи QR-код чи 5-значний код з екрана дитині." },
  {
    Icon: BadgeCheck,
    text: "При успішній оплаті вирине зелене сповіщення з ПІБ дитини, а QR-код автоматично оновиться для наступного покупця.",
  },
];

const TIP = {
  child:
    "Обирай одразу декілька товарів (наприклад, лимонад + смаколики) та сплачуй за все разом однією сумою! Це зручніше, ніж сканувати QR-код за кожну дрібницю окремо.",
  supervisor:
    "Якщо дитина купує 2–3 речі одночасно — порахуй загальну суму та покажи один QR-код за все разом! Це зекономить час і вам, і дитині.",
};

/** Shared how-to card for the fair: separate copy for children and supervisors. */
const FairHowTo = ({ variant, className = "" }: Props) => {
  const steps = variant === "child" ? CHILD_STEPS : SUP_STEPS;
  const title = variant === "child" ? "Як купувати на ярмарку?" : "Як продавати на ярмарку?";
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
      /* ignore */
    }
  };

  if (hidden) {
    return (
      <div className={`relative z-10 -mt-2 flex justify-end ${className}`}>
        <button
          type="button"
          onClick={() => setState(false)}
          aria-label={title}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-200 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-amber-500/20 active:scale-95"
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2} />
          Інструкція
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.9} />
        <p className="flex-1 text-[13px] font-semibold tracking-tight text-amber-200">{title}</p>
        <button
          type="button"
          onClick={() => setState(true)}
          aria-label="Закрити інструкцію"
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200/90 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-amber-500/20 active:scale-95"
        >
          <X className="h-3 w-3" strokeWidth={2.4} /> Закрити
        </button>
      </div>

      <ol className="mt-3 space-y-2.5">
        {steps.slice(0, 1).map(({ Icon, text }, i) => (
          <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-amber-100/85">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={1.9} />
            <span>
              <span className="font-semibold text-amber-200">Крок 1:</span> {text}
            </span>
          </li>
        ))}
      </ol>

      <div className="my-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
        <span className="inline-flex items-center gap-1.5 font-bold text-amber-300">
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} /> ВАЖЛИВА ПОРАДА:
        </span>{" "}
        {TIP[variant]}
      </div>

      <ol className="space-y-2.5">
        {steps.slice(1).map(({ Icon, text }, i) => (
          <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-amber-100/85">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={1.9} />
            <span>
              <span className="font-semibold text-amber-200">Крок {i + 2}:</span> {text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default FairHowTo;
