import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Gift,
  Loader2,
  Medal,
  Smartphone,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHaptics } from '@/hooks/useHaptics';
import IronPixelAvatar from '@/components/ui/IronPixelAvatar';
import { CertificateModal } from '@/components/certificate/CertificateModal';
import DeviceSyncModal from '@/components/alumni/DeviceSyncModal';
import AlumniRaffleModal from '@/components/alumni/AlumniRaffleModal';
import { pushIsland } from '@/lib/islandBus';
import {
  loadAlumniPassport,
  buildAlumniPassport,
  saveAlumniPassport,
  type AlumniPassportEnvelope,
} from '@/lib/alumniPassport';
import { getChildArchiveSnapshot } from '@/lib/session';
import {
  subscribeAlumniBroadcast,
  type AlumniBroadcastKind,
  type AlumniBroadcastPayload,
} from '@/lib/alumniBridge';

interface Props {
  onBack: () => void;
}

/** Кабінет випускника проєкту «Залізна Зміна» (Iron Alumni Hub) */
const AlumniFlow = ({ onBack }: Props) => {
  const haptics = useHaptics();
  const [loading, setLoading] = useState(true);
  const [passport, setPassport] = useState<AlumniPassportEnvelope | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [raffleOpen, setRaffleOpen] = useState(false);
  const [raffleKind, setRaffleKind] = useState<AlumniBroadcastKind>('alumni_raffle');
  const [rafflePayload, setRafflePayload] = useState<AlumniBroadcastPayload | null>(null);

  // 1. Пошук локального паспорта, за потреби — конвертація офлайн-знімку Учасника
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const existing = await loadAlumniPassport();
      if (cancelled) return;

      if (existing) {
        setPassport(existing);
        setLoading(false);
        return;
      }

      const snapshot = getChildArchiveSnapshot();
      if (snapshot?.child) {
        const built = buildAlumniPassport({
          full_name: snapshot.child.full_name,
          team_number: snapshot.child.team_number,
          iron_dollars: snapshot.child.iron_dollars,
          shift_id: snapshot.child.shift_id,
          year: new Date(snapshot.savedAt || Date.now()).getFullYear(),
          achievements: [
            `Команда №${snapshot.child.team_number}`,
            `Підсумковий баланс ${snapshot.child.iron_dollars} А$`,
          ],
        });
        await saveAlumniPassport(built);
        if (!cancelled) setPassport(built);
      }

      if (!cancelled) setLoading(false);
    };

    boot();
    return () => { cancelled = true; };
  }, []);

  // 2. Ефемерний канал Штабу (розіграші та оголошення)
  useEffect(() => {
    if (!passport) return;
    const off = subscribeAlumniBroadcast((kind, payload) => {
      setRaffleKind(kind);
      setRafflePayload(payload);
      setRaffleOpen(true);
      haptics.notification('success');
      pushIsland(
        kind === 'alumni_raffle' ? `🎁 ${payload.title}` : `📢 ${payload.title}`,
        'gradient',
        'Штаб · випускники',
      );
    });
    return off;
  }, [passport, haptics]);

  const handleReceived = useCallback((next: AlumniPassportEnvelope) => {
    setPassport(next);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center gap-3 bg-[#05070D] text-slate-300">
        <Loader2 className="w-6 h-6 animate-spin text-[#FFB800]" />
        <p className="text-xs font-semibold">Читаємо офлайн-паспорт…</p>
      </div>
    );
  }

  /* ---------------------------------------------------------------
     ПОРОЖНІЙ СТАН: паспорта на цьому пристрої немає
  --------------------------------------------------------------- */
  if (!passport) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#05070D] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white min-h-[40px]">
          <ArrowLeft className="w-4 h-4 text-[#FA5A15]" /> Назад
        </button>

        <div className="mt-10 max-w-md mx-auto rounded-3xl border border-[#FFB800]/20 bg-[#0A0E18]/80 backdrop-blur-2xl p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#FFB800] to-[#FA5A15] flex items-center justify-center shadow-lg">
            <Medal className="w-7 h-7 text-black" />
          </div>
          <h1 className="mt-4 text-lg font-black text-white">Паспорт випускника не знайдено</h1>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            Дані зберігаються лише на вашому пристрої. Якщо це новий телефон — перенесіть паспорт зі старого
            за 6-значним кодом.
          </p>
          <button
            onClick={() => { haptics.impact('light'); setSyncOpen(true); }}
            className="mt-5 w-full h-12 rounded-2xl font-black bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black"
          >
            Відновити паспорт з іншого телефону
          </button>
        </div>

        <DeviceSyncModal
          open={syncOpen}
          onClose={() => setSyncOpen(false)}
          passport={null}
          defaultMode="receive"
          onReceived={handleReceived}
        />
      </div>
    );
  }

  const profile = passport.child_profile;

  return (
    <div className="min-h-[100dvh] w-full bg-[#05070D] px-3.5 sm:px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white min-h-[40px]">
          <ArrowLeft className="w-4 h-4 text-[#FA5A15]" /> Головна
        </button>

        {/* Преміальна картка випускника */}
        <section className="relative mt-2 rounded-3xl border border-[#FFB800]/25 bg-[#07090E]/90 backdrop-blur-2xl p-4 sm:p-5 overflow-hidden shadow-xl">
          <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-[#FFB800]/10 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <IronPixelAvatar name={profile.full_name} size={64} bare className="rounded-2xl overflow-hidden shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FFB800]">
                🏅 Випускник проєкту «Залізна Зміна {profile.year}»
              </p>
              <h1 className="text-base sm:text-lg font-black text-white truncate">{profile.full_name}</h1>
              <p className="text-[11px] text-slate-400 truncate">
                Команда №{profile.team_number} · {profile.shift_name}
              </p>
            </div>
          </div>

          <div className="relative mt-4 grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Залізний спадок</p>
              <p className="font-mono text-xl font-black text-[#FFB800] tabular-nums">{profile.iron_dollars} А$</p>
            </div>
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Статус</p>
              <p className="text-sm font-black text-white flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-[#FFB800]" /> Випускник
              </p>
            </div>
          </div>
        </section>

        {/* Досягнення */}
        {passport.achievements.length > 0 && (
          <section className="mt-3 rounded-3xl border border-white/10 bg-[#0A0E18]/70 backdrop-blur-2xl p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FFB800]" /> Досягнення
            </p>
            <ul className="mt-2 space-y-1.5">
              {passport.achievements.map((a, i) => (
                <li key={`${a}-${i}`} className="text-xs text-slate-300 flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#FA5A15] shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Дії */}
        <section className="mt-3 space-y-2">
          <button
            onClick={() => { haptics.impact('light'); setCertOpen(true); }}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-white/10 bg-[#0A0E18]/70 backdrop-blur-2xl hover:border-[#FFB800]/40 transition-colors text-left"
          >
            <Award className="w-5 h-5 text-[#FFB800] shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">Офіційний сертифікат {profile.year}</span>
              <span className="block text-[11px] text-slate-400">Завантаження підписаного PDF з офлайн-генератора</span>
            </span>
          </button>

          <button
            onClick={() => { haptics.impact('light'); toast.message('Активності від Штабу приходять миттєво, коли ви онлайн'); }}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-white/10 bg-[#0A0E18]/70 backdrop-blur-2xl hover:border-[#FFB800]/40 transition-colors text-left"
          >
            <Gift className="w-5 h-5 text-[#FFB800] shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">Центр розіграшів та спільноти</span>
              <span className="block text-[11px] text-slate-400">Закриті активності для випускників проєкту</span>
            </span>
          </button>

          <button
            onClick={() => { haptics.impact('light'); setSyncOpen(true); }}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-white/10 bg-[#0A0E18]/70 backdrop-blur-2xl hover:border-[#FFB800]/40 transition-colors text-left"
          >
            <Smartphone className="w-5 h-5 text-[#FFB800] shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">Перенести паспорт на новий телефон</span>
              <span className="block text-[11px] text-slate-400">Тимчасовий код на 3 хвилини · дані не залишають пристрої</span>
            </span>
          </button>
        </section>

        <p className="mt-4 text-center text-[10px] text-slate-600 leading-relaxed">
          Паспорт зберігається лише на цьому пристрої · схема {passport._schema_version} · хеш {passport.checksum}
        </p>
      </div>

      <CertificateModal open={certOpen} onClose={() => setCertOpen(false)} initialName={profile.full_name} />

      <DeviceSyncModal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        passport={passport}
        defaultMode="send"
        onReceived={handleReceived}
      />

      <AlumniRaffleModal
        open={raffleOpen}
        onClose={() => setRaffleOpen(false)}
        kind={raffleKind}
        payload={rafflePayload}
        fullName={profile.full_name}
        passportId={passport.passport_id}
      />
    </div>
  );
};

export default AlumniFlow;
