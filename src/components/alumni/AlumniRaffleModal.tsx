import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Gift, Ticket, Sparkles, Megaphone } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import { fnv1a } from '@/lib/alumniPassport';
import type { AlumniBroadcastKind, AlumniBroadcastPayload } from '@/lib/alumniBridge';

interface Props {
  open: boolean;
  onClose: () => void;
  kind: AlumniBroadcastKind;
  payload: AlumniBroadcastPayload | null;
  /** ПІБ випускника — для детермінованого номера лотерейного білета */
  fullName: string;
  passportId: string;
}

const SEGMENTS = ['🎁', '🧢', '👕', '🎒', '☕️', '🏅', '📻', '🎟️'];

/** Інтерактивне вікно розіграшу / святкового оголошення від Штабу */
export const AlumniRaffleModal = ({ open, onClose, kind, payload, fullName, passportId }: Props) => {
  const haptics = useHaptics();
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [joined, setJoined] = useState(false);
  const timerRef = useRef<number | null>(null);

  const ticket = useMemo(() => {
    const hash = fnv1a(`${passportId}:${fullName}:${payload?.sent_at ?? 0}`);
    return `IRON-${hash.slice(0, 4).toUpperCase()}-${hash.slice(4, 8).toUpperCase()}`;
  }, [passportId, fullName, payload?.sent_at]);

  useEffect(() => {
    if (!open) {
      setSpinning(false);
      setJoined(false);
      setAngle(0);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    }
  }, [open]);

  const join = () => {
    if (spinning || joined) return;
    haptics.impact('medium');
    setSpinning(true);
    const turns = 6 + Math.floor(Math.random() * 3);
    const target = turns * 360 + Math.floor(Math.random() * 360);
    setAngle(target);
    timerRef.current = window.setTimeout(() => {
      setSpinning(false);
      setJoined(true);
      haptics.notification('success');
    }, 4200);
  };

  const isRaffle = kind === 'alumni_raffle';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[88dvh] overflow-y-auto rounded-3xl border border-[#FFB800]/25 bg-[#07090E]/95 backdrop-blur-2xl p-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
            {isRaffle ? <Gift className="w-5 h-5 text-[#FFB800]" /> : <Megaphone className="w-5 h-5 text-[#FFB800]" />}
            {payload?.title || (isRaffle ? 'Розіграш для випускників' : 'Оголошення Штабу')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {isRaffle
              ? 'Активність доступна лише для випускників проєкту, які зараз онлайн.'
              : 'Святкове повідомлення від Штабу проєкту «Залізна Зміна».'}
          </DialogDescription>
        </DialogHeader>

        {isRaffle ? (
          <div className="mt-2 flex flex-col items-center gap-4">
            <div className="relative w-52 h-52 flex items-center justify-center">
              <div className="absolute -inset-4 rounded-full bg-[#FFB800]/15 blur-2xl" />
              <div
                className="relative w-48 h-48 rounded-full border-4 border-[#FFB800]/40 bg-[conic-gradient(from_0deg,#1A1206,#2A1A08,#1A1206,#2A1A08,#1A1206,#2A1A08,#1A1206,#2A1A08,#1A1206)] shadow-[0_0_40px_rgba(255,184,0,0.25)]"
                style={{
                  transform: `rotate(${angle}deg)`,
                  transition: spinning ? 'transform 4s cubic-bezier(0.12, 0.75, 0.12, 1)' : 'none',
                }}
              >
                {SEGMENTS.map((s, i) => (
                  <span
                    key={s + i}
                    className="absolute left-1/2 top-1/2 text-xl"
                    style={{ transform: `rotate(${(360 / SEGMENTS.length) * i}deg) translateY(-72px) translateX(-50%)` }}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div className="absolute -top-1 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-[#FA5A15]" />
            </div>

            <div className="w-full p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-center">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">Ваш білет</p>
              <p className="font-mono text-lg font-black text-[#FFB800] tracking-wider">{ticket}</p>
              {payload?.prize && (
                <p className="mt-1 text-xs text-slate-300">Приз: <span className="font-bold text-white">{payload.prize}</span></p>
              )}
            </div>

            {joined ? (
              <div className="w-full p-3 rounded-2xl bg-gradient-to-r from-[#FFB800]/15 to-[#FA5A15]/15 border border-[#FFB800]/30 text-center">
                <p className="text-sm font-black text-white flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FFB800]" /> Білет у грі!
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Переможців оголосить Штаб у спільноті випускників.</p>
              </div>
            ) : (
              <Button
                onClick={join}
                disabled={spinning}
                className="w-full h-12 rounded-2xl font-black bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black hover:opacity-90"
              >
                <Ticket className="w-4 h-4 mr-2" /> {spinning ? 'Крутимо…' : 'Взяти участь'}
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10">
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                {payload?.message || 'Штаб вітає випускників проєкту!'}
              </p>
            </div>
            <Button onClick={onClose} className="w-full h-11 rounded-2xl font-bold bg-white/10 text-white hover:bg-white/15">
              Дякую
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AlumniRaffleModal;
