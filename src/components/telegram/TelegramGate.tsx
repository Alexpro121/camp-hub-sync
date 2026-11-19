import { closeMiniApp, type TelegramBlockState } from '@/lib/telegramAuth';

const COPY: Record<TelegramBlockState, { title: string; text: string }> = {
  unlinked: {
    title: 'Спершу увійди в боті',
    text: 'Поверніться в чат з ботом і натисніть «Старт». Після входу застосунок відкриватиметься сам.',
  },
  pending: {
    title: 'Заявка на розгляді',
    text: 'Адміністратор ще не підтвердив вашу реєстрацію. Бот напише, щойно це станеться.',
  },
  revoked: {
    title: 'Доступ вимкнено',
    text: 'Цей акаунт зараз не має доступу. Зверніться до адміністратора.',
  },
  error: {
    title: 'Не вдалося увійти',
    text: 'Перевірте зв’язок з інтернетом і спробуйте ще раз.',
  },
};

/** Екран замість форм входу всередині Telegram: доступ видає лише бот. */
const TelegramGate = ({ state, text }: { state: TelegramBlockState; text?: string }) => {
  const copy = COPY[state];
  return (
    <main className="min-h-[100dvh] w-full flex items-center justify-center bg-[#05070D] text-slate-100 px-6 safe-top">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-xl font-black tracking-tight">{copy.title}</h1>
        <p className="text-sm text-slate-400 leading-relaxed">{text ?? copy.text}</p>
        <div className="flex flex-col gap-2 pt-2">
          {state === 'error' && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] rounded-xl bg-slate-100 text-slate-900 font-bold active:scale-[0.98] transition-transform"
            >
              Спробувати ще раз
            </button>
          )}
          <button
            type="button"
            onClick={closeMiniApp}
            className="w-full min-h-[44px] rounded-xl border border-slate-700 text-slate-200 font-medium active:scale-[0.98] transition-transform"
          >
            Закрити
          </button>
        </div>
      </div>
    </main>
  );
};

export default TelegramGate;
