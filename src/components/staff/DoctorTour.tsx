import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Cross, Search, Stethoscope, ClipboardList, Users, Filter, X, HelpCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const DOCTOR_TOUR_KEY = 'helpsuprov:doctor-tour-seen';

export interface DoctorTourActions {
  openFirstChild: () => void;
  closeChild: () => void;
  setMarked: (v: boolean) => void;
}

interface Step { sel: string; icon: React.ComponentType<{ className?: string }>; title: string; text: string; enter?: (a: DoctorTourActions) => void }

const STEPS: Step[] = [
  { sel: 'header', icon: Stethoscope, title: 'Вітаємо в медичному кабінеті', text: 'Тут видно всіх дітей з активних змін і скільки з них мають медичну помітку. Присутність тут не позначається — це робить реєстрація й супровід.', enter: (a) => { a.closeChild(); a.setMarked(false); } },
  { sel: 'search', icon: Search, title: 'Розумний пошук', text: 'Пишіть прізвище, ім’я або частину телефону. Пошук розуміє помилки, апострофи та неправильну розкладку.', enter: (a) => a.closeChild() },
  { sel: 'shift', icon: Filter, title: 'Вибір зміни', text: 'Оберіть зміну, щоб бачити лише її дітей, або «Усі зміни».', enter: (a) => a.closeChild() },
  { sel: 'marked', icon: Cross, title: 'Фільтр «З поміткою»', text: 'Одним дотиком лишає тільки дітей з червоним ➕ — тих, кому потрібна увага.', enter: (a) => { a.closeChild(); a.setMarked(false); } },
  { sel: 'card', icon: Users, title: 'Картка дитини', text: 'Тут команда, зміна, ПІБ супроводу та телефон. Натисніть на картку, щоб відкрити повний профіль.', enter: (a) => a.closeChild() },
  { sel: 'attention', icon: Cross, title: 'Червоний плюсик для супроводу', text: 'Позначте «Потребує уваги» — біля дитини в супроводу засвітиться червоний ➕. Коли все добре, зніміть позначку або натисніть «Прибрати червоний плюсик».', enter: (a) => a.openFirstChild() },
  { sel: 'note', icon: ClipboardList, title: 'Нотатка лікаря', text: 'Опишіть стан, ліки чи рекомендації. Супровід побачить текст як «Лікар: …». Якщо інший лікар змінить помітку одночасно — застосунок попередить і нічого не зітре.', enter: (a) => a.openFirstChild() },
  { sel: 'supervisors', icon: Users, title: 'Супровід команди', text: 'ПІБ супроводу дитини — щоб одразу знати, до кого звернутися.', enter: (a) => a.openFirstChild() },
  { sel: 'save', icon: Check, title: 'Збереження', text: 'Натисніть «Зберегти» — помітка одразу з’явиться в супроводу. Список сам оновлюється кожні 20 секунд.', enter: (a) => a.openFirstChild() },
  { sel: 'help', icon: HelpCircle, title: 'Готово!', text: 'Цей інструктаж завжди можна повторити кнопкою «?» вгорі. Гарної зміни!', enter: (a) => a.closeChild() },
];

const PAD = 8;

export default function DoctorTour({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: DoctorTourActions }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const swipe = useRef<number | null>(null);
  const actRef = useRef(actions); actRef.current = actions;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const go = useCallback((n: number) => {
    if (n < 0 || n >= STEPS.length) return;
    STEPS[n].enter?.(actRef.current);
    setI(n);
  }, []);
  useEffect(() => { if (open) go(0); }, [open, go]);
  const close = useCallback(() => {
    try { localStorage.setItem(DOCTOR_TOUR_KEY, new Date().toISOString()); } catch { /* noop */ }
    actRef.current.closeChild();
    onClose();
  }, [onClose]);
  const next = () => (last ? close() : go(i + 1));
  const prev = () => go(i - 1);

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-doctor-tour="${step.sel}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect((p) => p && Math.abs(p.top - r.top) < 0.5 && Math.abs(p.left - r.left) < 0.5 && Math.abs(p.width - r.width) < 0.5 && Math.abs(p.height - r.height) < 0.5 ? p : r);
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    let tries = 0; let t: ReturnType<typeof setTimeout>;
    const find = () => {
      const el = document.querySelector(`[data-doctor-tour="${step.sel}"]`) as HTMLElement | null;
      if (el) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* noop */ } t = setTimeout(measure, 260); return; }
      setRect(null);
      if (['attention', 'note', 'supervisors', 'save'].includes(step.sel)) actRef.current.openFirstChild();
      if (tries++ < 20) t = setTimeout(find, 120);
    };
    t = setTimeout(find, 80);
    const iv = setInterval(measure, 300);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); clearInterval(iv); window.removeEventListener('resize', measure); };
  }, [open, i, step, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest('button')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prev(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;
  const vh = window.innerHeight;
  const below = rect ? rect.bottom < vh * 0.55 : false;
  const S = step.icon;

  return createPortal(
    <div className="doctor-desk fixed inset-0 z-[9999]" style={{ pointerEvents: 'auto' }} role="dialog" aria-modal="true" aria-label="Інструктаж лікаря">
      <div className="absolute inset-0" style={{ touchAction: 'none' }} onPointerDown={(e) => e.stopPropagation()} />
      <div
        className="pointer-events-none absolute left-0 top-0 rounded-xl"
        style={{
          width: rect ? rect.width + PAD * 2 : 0,
          height: rect ? rect.height + PAD * 2 : 0,
          transform: `translate3d(${rect ? rect.left - PAD : window.innerWidth / 2}px, ${rect ? rect.top - PAD : vh / 2}px, 0)`,
          boxShadow: '0 0 0 9999px hsl(var(--background) / 0.82), 0 0 0 3px hsl(var(--primary)), 0 0 28px hsl(var(--primary) / 0.5)',
          transition: 'transform .35s cubic-bezier(.32,.72,0,1), width .35s ease, height .35s ease',
        }}
      >
        {rect && <span className="absolute inset-0 rounded-xl ring-2 ring-primary/60 motion-safe:animate-ping" />}
      </div>
      <div
        className="absolute inset-x-3 mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl"
        style={below ? { bottom: 'max(16px, env(safe-area-inset-bottom))' } : { top: 'max(16px, env(safe-area-inset-top))' }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => { swipe.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { const s = swipe.current; swipe.current = null; if (s === null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 60) (dx < 0 ? next() : prev()); }}
      >
        <div key={i} className="animate-fade-in space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><S className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary">Крок {i + 1} з {STEPS.length}</p>
              <h3 className="text-base font-bold leading-tight">{step.title}</h3>
            </div>
            <button type="button" onClick={close} aria-label="Закрити інструктаж" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          <div className="flex justify-center gap-1.5">
            {STEPS.map((_, k) => (
              <button key={k} type="button" aria-label={`Крок ${k + 1}`} onClick={() => go(k)}
                className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-primary' : k < i ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted-foreground/30'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && <Button variant="outline" className="h-11 flex-1" onClick={prev}><ChevronLeft />Назад</Button>}
            <Button className="h-11 flex-[1.5]" onClick={next}>{last ? 'Почати роботу' : <>Далі<ChevronRight /></>}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
