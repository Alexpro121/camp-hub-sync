import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dices, Megaphone, Loader2, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { sendAlumniBroadcast } from '@/lib/alumniBridge';
import { useHaptics } from '@/hooks/useHaptics';

/** Блок Штабу: ефемерний зв'язок з випускниками (0 записів у базі даних) */
export const AdminAlumniBroadcast = () => {
  const haptics = useHaptics();
  const [title, setTitle] = useState('Розіграш фірмового мерчу УЗ');
  const [prize, setPrize] = useState('Худі Iron Squad');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState<null | 'raffle' | 'note'>(null);

  const fire = async (kind: 'raffle' | 'note') => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error('Вкажіть заголовок');
      return;
    }
    if (kind === 'note' && !message.trim()) {
      toast.error('Введіть текст оголошення');
      return;
    }

    setSending(kind);
    try {
      await sendAlumniBroadcast(kind === 'raffle' ? 'alumni_raffle' : 'alumni_announcement', {
        title: cleanTitle,
        prize: kind === 'raffle' ? prize.trim() : undefined,
        message: kind === 'note' ? message.trim() : undefined,
      });
      haptics.notification('success');
      toast.success(kind === 'raffle' ? 'Розіграш запущено серед випускників' : 'Оголошення надіслано');
    } catch (e) {
      console.error(e);
      toast.error('Не вдалося надіслати подію');
    } finally {
      setSending(null);
    }
  };

  return (
    <section className="rounded-3xl border border-[#FFB800]/20 bg-[#0A0E18]/70 backdrop-blur-2xl p-4">
      <header className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-[#FFB800]" />
        <h3 className="text-sm font-black text-white uppercase tracking-wide">Зв'язок з випускниками</h3>
      </header>
      <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
        Події летять напряму тим випускникам, які зараз онлайн. У базі даних не зберігається жодного рядка.
      </p>

      <div className="mt-3 space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок"
          className="h-11 bg-[#07090E] border-white/10 text-white rounded-xl text-sm"
        />
        <Input
          value={prize}
          onChange={(e) => setPrize(e.target.value)}
          placeholder="Приз (для розіграшу)"
          className="h-11 bg-[#07090E] border-white/10 text-white rounded-xl text-sm"
        />
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Текст святкового оголошення"
          className="min-h-[80px] bg-[#07090E] border-white/10 text-white rounded-xl text-sm"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          onClick={() => fire('raffle')}
          disabled={sending !== null}
          className="h-11 rounded-xl font-black bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black hover:opacity-90"
        >
          {sending === 'raffle' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Dices className="w-4 h-4 mr-2" />}
          Експрес-розіграш
        </Button>
        <Button
          onClick={() => fire('note')}
          disabled={sending !== null}
          className="h-11 rounded-xl font-bold bg-white/10 text-white hover:bg-white/15"
        >
          {sending === 'note' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
          Святкове оголошення
        </Button>
      </div>
    </section>
  );
};

export default AdminAlumniBroadcast;
