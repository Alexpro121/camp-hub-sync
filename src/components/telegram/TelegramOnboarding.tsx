import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getTg } from '@/hooks/useTelegramWebApp';
import { closeMiniApp, registrationCode, tgApp } from '@/lib/telegramAuth';

/**
 * Перший вхід у Mini App для неприв'язаного Telegram-акаунта.
 * Дитина: ПІБ → команда → «Це ти?». Працівник (посилання реєстрації або адмін зі списку): ПІБ → тип → номер телефону.
 * Усі рішення приймає сервер (tg-app); тут лише форми.
 */

const page = 'min-h-[100dvh] w-full flex items-center justify-center bg-[#05070D] text-slate-100 px-5 py-8 safe-top';
const card = 'w-full max-w-sm space-y-4';
const input = 'w-full h-12 rounded-xl bg-slate-900 border border-slate-700 px-4 text-base outline-none focus:border-slate-400';
const primary = 'w-full min-h-[48px] rounded-xl bg-slate-100 text-slate-900 font-bold active:scale-[0.98] transition-transform disabled:opacity-50';
const secondary = 'w-full min-h-[44px] rounded-xl border border-slate-700 text-slate-200 font-medium active:scale-[0.98] transition-transform';
const reload = () => window.location.reload();

const Title = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="space-y-1.5">
    <h1 className="text-xl font-black tracking-tight">{children}</h1>
    {sub && <p className="text-sm text-slate-400 leading-relaxed">{sub}</p>}
  </div>
);
const Note = ({ text }: { text: string }) => <p className="text-sm text-amber-300 leading-relaxed">{text}</p>;

/* ------------------------------------ дитина ------------------------------------ */

const CHILD_ERRORS: Record<string, string> = {
  not_found: 'Не знайшли тебе в цій команді. Перевір, як написане прізвище та імʼя, і спробуй ще раз.',
  ambiguous: 'У цій команді кілька людей з таким іменем. Підійди, будь ласка, до свого супроводу.',
  too_many: 'Забагато спроб. Спробуй через 10 хвилин або підійди до свого супроводу.',
  no_shift: 'Зараз немає активної зміни. Спробуй пізніше.',
  expired: 'Минуло забагато часу. Почни ще раз.',
  error: 'Не вдалося увійти. Спробуй ще раз.',
};

const ChildBind = () => {
  const [step, setStep] = useState<'name' | 'team' | 'confirm' | 'waiting'>('name');
  const [name, setName] = useState('');
  const [teams, setTeams] = useState<number[] | null>(null);
  const [found, setFound] = useState<{ masked: string; team: number; ticket: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const goTeams = async () => {
    if (name.trim().length < 2) { setNote('Напиши прізвище та імʼя.'); return; }
    setBusy(true); setNote('');
    try {
      const res = await tgApp<{ teams: number[] }>('child_teams');
      if (!res.teams?.length) setNote(CHILD_ERRORS.no_shift);
      else { setTeams(res.teams); setStep('team'); }
    } catch { setNote(CHILD_ERRORS.error); }
    setBusy(false);
  };

  const pickTeam = async (team: number) => {
    setBusy(true); setNote('');
    try {
      const res = await tgApp<{ state: string; masked?: string; team?: number; ticket?: string }>('child_search', { name, team });
      if (res.state === 'already_linked') { reload(); return; }
      if (res.state === 'found' && res.masked && res.ticket) { setFound({ masked: res.masked, team, ticket: res.ticket }); setStep('confirm'); }
      else { setNote(CHILD_ERRORS[res.state] ?? CHILD_ERRORS.error); setStep('name'); }
    } catch { setNote(CHILD_ERRORS.error); }
    setBusy(false);
  };

  const confirm = async (yes: boolean) => {
    setBusy(true); setNote('');
    try {
      if (!yes) {
        await tgApp('child_reject');
        setFound(null); setStep('name'); setNote('Добре, напиши прізвище та імʼя ще раз.');
      } else {
        const res = await tgApp<{ state: string }>('child_confirm', { ticket: found?.ticket });
        if (res.state === 'linked') { reload(); return; }
        if (res.state === 'rebind_pending' || res.state === 'already_requested') setStep('waiting');
        else { setNote(CHILD_ERRORS[res.state] ?? CHILD_ERRORS.error); setStep('name'); }
      }
    } catch { setNote(CHILD_ERRORS.error); }
    setBusy(false);
  };

  if (step === 'waiting') {
    return (
      <div className={card}>
        <Title sub="Цей профіль уже відкрито з іншого Telegram. Ми попросили твій супровід підтвердити вхід — бот напише, щойно буде рішення.">Чекаємо на супровід</Title>
        <button type="button" className={secondary} onClick={closeMiniApp}>Закрити</button>
      </div>
    );
  }

  return (
    <div className={card}>
      <Title sub="Один раз знайди себе в списку табору — далі застосунок відкриватиметься одразу.">Привіт! 👋</Title>
      {step === 'name' && (
        <>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Прізвище та імʼя"
            autoComplete="name" autoCapitalize="words" onKeyDown={(e) => e.key === 'Enter' && goTeams()} />
          {note && <Note text={note} />}
          <button type="button" className={primary} disabled={busy} onClick={goTeams}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Далі'}
          </button>
        </>
      )}
      {step === 'team' && teams && (
        <>
          <p className="text-sm text-slate-300">Обери номер своєї команди:</p>
          <div className="grid grid-cols-5 gap-2">
            {teams.map((t) => (
              <button key={t} type="button" disabled={busy} onClick={() => pickTeam(t)}
                className="h-12 rounded-xl border border-slate-700 bg-slate-900 font-bold active:scale-95 transition-transform disabled:opacity-50">{t}</button>
            ))}
          </div>
          {note && <Note text={note} />}
          <button type="button" className={secondary} onClick={() => setStep('name')}>Назад</button>
        </>
      )}
      {step === 'confirm' && found && (
        <>
          <p className="text-lg">Ти — <b>{found.masked}</b>, команда {found.team}?</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={primary} disabled={busy} onClick={() => confirm(true)}>Так, це я</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => confirm(false)}>Ні</button>
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------- працівник ------------------------------- */

const KINDS = [
  { value: 'supervisor', label: 'Супровід' },
  { value: 'duckling', label: 'Каченя' },
  { value: 'doctor', label: 'Лікар' },
] as const;

const REG_ERRORS: Record<string, string> = {
  invalid_name: 'Напишіть прізвище та імʼя повністю, наприклад: Коваль Олена.',
  invalid_code: 'Посилання для реєстрації недійсне. Попросіть у адміністратора нове.',
  invalid_join: 'Це посилання на зміну вже недійсне. Попросіть у адміністратора нове.',
  already_pending: 'Ваша заявка вже на розгляді.',
  error: 'Не вдалося надіслати заявку. Спробуйте ще раз.',
};

type JoinInfo = { token: string; shift: string };

const StaffRegister = ({ code, adminCandidate, join }: { code: string | null; adminCandidate: boolean; join?: JoinInfo | null }) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('supervisor');
  const [phoneShared, setPhoneShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const sharePhone = () => {
    setNote('');
    const tg = getTg();
    if (!tg?.requestContact) { setNote('Оновіть Telegram: ця версія не вміє ділитися номером із застосунку.'); return; }
    tg.requestContact((sent) => {
      if (sent) setPhoneShared(true);
      else setNote('Без номера телефону заявку не надіслати.');
    });
  };

  const submit = async () => {
    setBusy(true); setNote('');
    try {
      // Контакт доходить до бота за мить після згоди — кілька спроб із паузою.
      for (let i = 0; i < 5; i++) {
        const res = await tgApp<{ state: string }>('reg_submit', { code, fullName: name, kind, ...(join ? { join: join.token } : {}) });
        if (res.state === 'approved' || res.state === 'linked') { reload(); return; }
        if (res.state === 'pending') { setDone(true); break; }
        if (res.state === 'need_phone') {
          if (i < 4) { await new Promise((r) => setTimeout(r, 1500)); continue; }
          setPhoneShared(false); setNote('Номер ще не надійшов. Натисніть «Поділитися номером» ще раз.'); break;
        }
        setNote((join && res.state === 'invalid_code' ? REG_ERRORS.invalid_join : REG_ERRORS[res.state]) ?? REG_ERRORS.error); break;
      }
    } catch { setNote(REG_ERRORS.error); }
    setBusy(false);
  };

  if (done) {
    return (
      <div className={card}>
        <Title sub="Адміністратор отримав вашу заявку. Бот напише, щойно її підтвердять.">Заявку надіслано ✅</Title>
        <button type="button" className={secondary} onClick={closeMiniApp}>Закрити</button>
      </div>
    );
  }

  return (
    <div className={card}>
      {join
        ? <Title sub="Вкажіть прізвище, імʼя і номер телефону — після цього оберете свою команду.">Супровід зміни «{join.shift}»</Title>
        : <Title sub="Для супроводу, каченят і лікарів. Доступ відкриється після підтвердження адміністратором.">Реєстрація</Title>}
      <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Прізвище та імʼя" autoComplete="name" />
      {!adminCandidate && !join && (
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button key={k.value} type="button" onClick={() => setKind(k.value)}
              className={`min-h-[44px] rounded-xl border text-sm font-semibold ${kind === k.value ? 'bg-slate-100 text-slate-900 border-slate-100' : 'border-slate-700 text-slate-200'}`}>{k.label}</button>
          ))}
        </div>
      )}
      <button type="button" className={secondary} onClick={sharePhone} disabled={phoneShared}>
        {phoneShared ? 'Номер надано ✅' : '📱 Поділитися номером'}
      </button>
      {note && <Note text={note} />}
      <button type="button" className={primary} disabled={busy || !phoneShared || name.trim().length < 3} onClick={submit}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : join ? 'Зареєструватися' : 'Надіслати заявку'}
      </button>
    </div>
  );
};

/* --------------------------------- вибір режиму --------------------------------- */

const TelegramOnboarding = ({ join }: { join?: string } = {}) => {
  const [mode, setMode] = useState<{ staff: boolean; adminCandidate: boolean; join: JoinInfo | null; joinInvalid: boolean } | null>(null);
  const code = registrationCode();

  useEffect(() => {
    let cancelled = false;
    tgApp<{ allowed: boolean; adminCandidate: boolean; join?: { shift: string } | null; joinInvalid?: boolean }>('reg_status', { code, ...(join ? { join } : {}) })
      .then((res) => {
        if (cancelled) return;
        setMode({
          staff: res.allowed, adminCandidate: res.adminCandidate,
          join: join && res.join ? { token: join, shift: res.join.shift } : null, joinInvalid: Boolean(res.joinInvalid),
        });
      })
      .catch(() => { if (!cancelled) setMode({ staff: false, adminCandidate: false, join: null, joinInvalid: Boolean(join) }); });
    return () => { cancelled = true; };
  }, [code, join]);

  // Посилання зміни для дитини не підходить — замість входу дитини показуємо, що посилання недійсне.
  if (mode && join && !mode.staff) {
    return (
      <main className={page}>
        <div className={card}>
          <Title sub={mode.joinInvalid ? REG_ERRORS.invalid_join : REG_ERRORS.error}>Посилання на зміну</Title>
          <button type="button" className={secondary} onClick={closeMiniApp}>Закрити</button>
        </div>
      </main>
    );
  }

  return (
    <main className={page}>
      {!mode ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        : mode.staff ? <StaffRegister code={code} adminCandidate={mode.adminCandidate} join={mode.join} />
        : <ChildBind />}
    </main>
  );
};

export default TelegramOnboarding;
