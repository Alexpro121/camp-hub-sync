import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dices, Megaphone, Loader2, Radio, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendAlumniBroadcast, listAlumniBroadcasts, deleteAlumniBroadcast } from '@/lib/alumniBridge';
import { useHaptics } from '@/hooks/useHaptics';

type Item = Awaited<ReturnType<typeof listAlumniBroadcasts>>[number];

/** Блок Штабу: розсилки випускникам (зберігаються 30 днів — дійдуть і тим, хто офлайн) */
export const AdminAlumniBroadcast = () => {
  const haptics = useHaptics();
  const [title, setTitle] = useState('Розіграш фірмового мерчу УЗ');
  const [prize, setPrize] = useState('Худі Iron Squad');
  const [message, setMessage] = useState('');
  const [year, setYear] = useState('');
  const [sending, setSending] = useState<null | 'raffle' | 'note'>(null);
  const [items, setItems] = useState<Item[]>([]);

  const reload = useCallback(async () => setItems(await listAlumniBroadcasts(5)), []);
  useEffect(() => { void reload(); }, [reload]);

  const fire = async (kind: 'raffle' | 'note') => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return toast.error('Вкажіть заголовок');
    if (kind === 'note' && !message.trim()) return toast.error('Введіть текст оголошення');
    const y = year.trim() ? Number(year) : null;
    if (y !== null && (!Number.isInteger(y) || y < 2020 || y > 2100)) return toast.error('Невірний рік');

    setSending(kind);
    try {
      await sendAlumniBroadcast(kind === 'raffle' ? 'alumni_raffle' : 'alumni_announcement', {
        title: cleanTitle,
        prize: kind === 'raffle' ? prize.trim() : undefined,
        message: message.trim() || undefined,
        target_year: y,
      });
      haptics.notification('success');
      toast.success('Надіслано. Офлайн-випускники побачать при наступному відкритті.');
      void reload();
    } catch (e: any) {
      toast.error(e?.message?.includes('row-level') ? 'Розсилати може лише адміністратор' : 'Не вдалося надіслати');
    } finally {
      setSending(null);
    }
  };

  const remove = async (id: string) => {
    try { await deleteAlumniBroadcast(id); void reload(); } catch { toast.error('Не вдалося видалити'); }
  };

  return (
    <section className="rounded-3xl border border-[#FFB800]/20 bg-[#0A0E18]/70 backdrop-blur-2xl p-4">
      <header className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-[#FFB800]" />
        <h3 className="text-sm font-black text-white uppercase tracking-wide">Зв'язок з випускниками</h3>
      </header>
      <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
        Онлайн-випускники отримають одразу, інші — коли відкриють паспорт (протягом 30 днів).
      </p>

      <div className="mt-3 space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" maxLength={200}
          className="h-11 bg-[#07090E] border-white/10 text-white rounded-xl text-sm" />
        <Input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Приз (для розіграшу)"
          className="h-11 bg-[#07090E] border-white/10 text-white rounded-xl text-sm" />
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Текст оголошення" maxLength={2000}
          className="min-h-[80px] bg-[#07090E] border-white/10 text-white rounded-xl text-sm" />
        <Input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric"
          placeholder="Рік випуску (порожньо — усім)"
          className="h-11 bg-[#07090E] border-white/10 text-white rounded-xl text-sm" />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button onClick={() => fire('raffle')} disabled={sending !== null}
          className="h-11 rounded-xl font-black bg-gradient-to-r from-[#FFB800] to-[#FA5A15] text-black hover:opacity-90">
          {sending === 'raffle' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Dices className="w-4 h-4 mr-2" />}
          Експрес-розіграш
        </Button>
        <Button onClick={() => fire('note')} disabled={sending !== null}
          className="h-11 rounded-xl font-bold bg-white/10 text-white hover:bg-white/15">
          {sending === 'note' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
          Святкове оголошення
        </Button>
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">
              {it.kind === 'alumni_raffle' ? <Dices className="w-3.5 h-3.5 text-[#FFB800]" /> : <Megaphone className="w-3.5 h-3.5 text-slate-400" />}
              <span className="flex-1 truncate">{it.title}{it.target_year ? ` · ${it.target_year}` : ''}</span>
              <span className="text-[10px] text-slate-500">{new Date(it.created_at).toLocaleDateString('uk-UA')}</span>
              <button onClick={() => remove(it.id)} aria-label="Видалити" className="p-1 text-slate-500 hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AdminAlumniBroadcast;
