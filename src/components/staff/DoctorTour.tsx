import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Cross, Search, Stethoscope, ClipboardList, Users, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const DOCTOR_TOUR_KEY = 'helpsuprov:doctor-tour-seen';

const STEPS = [
  { icon: Stethoscope, title: 'Вітаємо в медичному кабінеті', text: 'Тут ви бачите всіх дітей з активних змін. Позначати присутність тут не можна — це робить реєстрація й супровід.' },
  { icon: Search, title: 'Розумний пошук', text: 'Шукайте за прізвищем, ім’ям або номером телефону. Пошук розуміє помилки, апострофи й неправильну розкладку клавіатури.' },
  { icon: Users, title: 'Фільтри та зміни', text: 'Оберіть зміну, щоб бачити лише її дітей. Кнопка «З поміткою» лишає тільки дітей, яким потрібна увага.' },
  { icon: ClipboardList, title: 'Повний профіль дитини', text: 'Натисніть на дитину: побачите її дані, телефон, команду та ПІБ супроводу — щоб знати, до кого звернутися.' },
  { icon: Cross, title: 'Медична помітка і червоний плюсик', text: 'Напишіть помітку й увімкніть «Потребує уваги» — біля дитини в супроводу засвітиться червоний ➕ з вашим текстом. Коли все добре, натисніть «Прибрати червоний плюсик».' },
  { icon: WifiOff, title: 'Одночасна робота', text: 'Якщо хтось змінив помітку, поки ви її редагували, застосунок попередить і запропонує завантажити свіжу версію, щоб нічого не загубилося. Список сам оновлюється кожні 20 секунд.' },
];

export default function DoctorTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const swipe = useRef<number | null>(null);
  useEffect(() => { if (open) setI(0); }, [open]);
  const close = () => { localStorage.setItem(DOCTOR_TOUR_KEY, new Date().toISOString()); onClose(); };
  const last = i === STEPS.length - 1;
  const next = () => (last ? close() : setI(i + 1));
  const prev = () => i > 0 && setI(i - 1);
  const S = STEPS[i];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-w-sm"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); }}
        onTouchStart={(e) => { swipe.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { const s = swipe.current; swipe.current = null; if (s === null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 60) (dx < 0 ? next() : prev()); }}
      >
        <DialogHeader>
          <div key={i} className="animate-fade-in space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><S.icon className="h-6 w-6" /></div>
            <p className="text-xs font-medium text-primary">Крок {i + 1} з {STEPS.length}</p>
            <DialogTitle className="text-left">{S.title}</DialogTitle>
            <DialogDescription className="text-left leading-relaxed">{S.text}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, k) => (
            <button key={k} type="button" aria-label={`Крок ${k + 1}`} onClick={() => setI(k)}
              className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {i > 0 && <Button variant="outline" className="flex-1" onClick={prev}><ChevronLeft />Назад</Button>}
          <Button className="flex-[1.5]" onClick={next}>{last ? 'Почати роботу' : <>Далі<ChevronRight /></>}</Button>
        </div>
        <button type="button" onClick={close} className="text-xs text-muted-foreground hover:text-foreground">Пропустити</button>
      </DialogContent>
    </Dialog>
  );
}
