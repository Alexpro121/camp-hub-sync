import { Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Тимчасова заглушка модуля FOH-пульта сцени.
 * Логіка та база даних збережені — вимкнено лише інтерфейс.
 */
const StageMaintenance = () => (
  <main className="min-h-screen bg-[#070A12] flex items-center justify-center p-5">
    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0A0E18]/90 backdrop-blur-2xl p-6 text-center space-y-4 shadow-2xl">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FA5A15]/15 border border-[#FA5A15]/30 flex items-center justify-center">
        <Wrench className="w-6 h-6 text-[#FA5A15]" />
      </div>
      <h1 className="text-base font-black uppercase tracking-wider text-white">
        Модуль на технічному обслуговуванні
      </h1>
      <p className="text-xs text-slate-400 leading-relaxed">
        Пульт сцени тимчасово недоступний. Слідкуй за оновленнями проєкту «Залізна Зміна».
      </p>
      <Link
        to="/"
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#FA5A15] hover:bg-[#FF7D3B] text-white text-xs font-black uppercase tracking-wide transition-all active:scale-95"
      >
        На головну
      </Link>
    </div>
  </main>
);

export default StageMaintenance;
