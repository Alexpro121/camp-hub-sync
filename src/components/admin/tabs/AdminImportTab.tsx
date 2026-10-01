import { copyText } from '@/lib/clipboard';
import { lazyRetry } from '@/lib/lazyRetry';
import { useEffect, useState } from 'react';
import { Trash2, Wand2, Loader2, AlertTriangle, Copy, Search, Pencil, RefreshCw, KeyRound, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHaptics } from '@/hooks/useHaptics';

import { generateMemorablePassword } from '@/components/admin/tabs/shared';

/* База даних та генератор паролів супроводу */
const DataTab = () => {
  const [count, setCount] = useState(0);
  const [teamsCount, setTeamsCount] = useState(0);
  const [passwords, setPasswords] = useState<Array<{ team: number; password: string; is_custom?: boolean }> | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwFilter, setPwFilter] = useState('');
  
  // Стейт діалогу редагування пароля
  const [editDialogTeam, setEditDialogTeam] = useState<number | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const haptics = useHaptics();

  const load = async () => {
    const { data } = await supabase.from('children').select('team_number');
    setCount(data?.length || 0);
    setTeamsCount(new Set((data || []).map((d: any) => d.team_number)).size);
  };
  useEffect(() => { load(); }, []);

  // Завантаження паролів — єдине джерело правди - база через Edge Function.
  // Жодних локальних «дефолтних» підстановок: вони показували неробочі паролі.
  const loadPasswords = async (silent = false) => {
    setPwLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('staff-login', {
        body: { action: 'list_team_passwords' },
      });

      if (error || !data?.passwords || !Array.isArray(data.passwords)) {
        throw new Error(data?.error || error?.message || 'load_failed');
      }

      setPasswords(data.passwords);
    } catch {
      if (!silent) toast.error('Не вдалося отримати паролі з бази. Спробуйте ще раз.');
    } finally {
      setPwLoading(false);
    }
  };

  const copyAll = async () => {
    if (!passwords?.length) return;
    const text = passwords.map((p) => `Команда №${p.team}: ${p.password}`).join('\n');
    try {
      await copyText(text);
      haptics.impact('light');
      toast.success('Усі паролі скопійовано в буфер');
    } catch {
      toast.error('Не вдалося скопіювати');
    }
  };

  const copySingle = (p: { team: number; password: string }) => {
    copyText(p.password).catch(() => {});
    haptics.impact('light');
    toast.success(`Пароль для команди №${p.team} скопійовано`);
  };

  // ✅ Збереження пароля через Edge Function (upsert у таблицю team_passwords)
  const savePassword = async (teamNum: number, newPass: string) => {
    const trimmed = newPass.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!trimmed) {
      toast.error('Пароль не може бути порожнім');
      return;
    }

    setSavingPw(true);
    try {
      const { data, error } = await supabase.functions.invoke('staff-login', {
        body: {
          action: 'update_team_password',
          team: teamNum,
          password: trimmed,
        },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || 'save_failed');
      }

      // Показуємо рівно те, що підтвердила база (readback), а не локальне припущення
      const effective: string = data.password ?? trimmed;
      setPasswords((prev) => {
        const row = { team: teamNum, password: effective, is_custom: true };
        if (!prev) return [row];
        const exists = prev.some((p) => p.team === teamNum);
        if (exists) return prev.map((p) => (p.team === teamNum ? { ...p, ...row } : p));
        return [...prev, row].sort((a, b) => a.team - b.team);
      });

      haptics.notification('success');
      toast.success(`Пароль для команди №${teamNum} оновлено: ${effective}`);
      setEditDialogTeam(null);

      // Повторна синхронізація зі списком у базі (гарантія, що адмін бачить робочий пароль)
      void loadPasswords(true);
    } catch (err: any) {
      haptics.notification('error');
      toast.error(err.message || 'Помилка збереження пароля');
    } finally {
      setSavingPw(false);
    }
  };

  // Швидка автогенерація 2 укр слів через крапку в 1 клік
  const quickRegenerate = async (teamNum: number) => {
    haptics.impact('light');
    const newPass = generateMemorablePassword();
    await savePassword(teamNum, newPass);
  };

  const filtered = (passwords || []).filter((p) =>
    !pwFilter.trim() || String(p.team).includes(pwFilter.replace(/[^\d]/g, '')),
  );

  const wipe = async () => {
    await supabase.from('children').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('transfers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await Promise.allSettled([
      supabase.from('train_coupes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('iron_dollar_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('uploaded_files').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('transfer_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ]);
    haptics.notification('success');
    toast.success('Базу успішно очищено');
    load();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 sm:p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Учасників у базі</p>
          <p className="text-3xl sm:text-4xl font-black mt-1 text-[#FA5A15] font-mono tabular-nums">{count}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-2xl">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Команд</p>
          <p className="text-3xl sm:text-4xl font-black mt-1 text-white font-mono tabular-nums">{teamsCount}</p>
        </Card>
      </div>

      {/* Блок паролів супроводу */}
      <Card className="p-4 sm:p-5 bg-[#0F1523]/85 backdrop-blur-xl border border-white/10 rounded-3xl space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-bold tracking-wider text-white flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#FA5A15]" />
              Паролі супроводу
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Формат автогенерації: <code className="text-[#FA5A15] font-mono">слово.слово</code> (2 укр слова через крапку)
            </p>
          </div>
        </div>

        {!passwords ? (
          <Button 
            onClick={() => loadPasswords()} 
            disabled={pwLoading} 
            className="w-full h-11 font-bold uppercase rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10"
          >
            {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2 text-[#FA5A15]" />}
            {pwLoading ? 'Завантаження...' : 'Показати паролі команд'}
          </Button>
        ) : (
          <div className="space-y-2.5 animate-slide-up">
            <div className="flex items-center gap-2">
              <Button 
                onClick={copyAll} 
                variant="outline" 
                className="h-10 text-xs font-bold rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 flex-1"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5 text-[#FA5A15]" /> Копіювати всі паролі
              </Button>
              <Button
                onClick={() => {
                  const pass = generateMemorablePassword();
                  copyText(pass).catch(() => {});
                  haptics.impact('light');
                  toast.success(`Згенеровано приклад: ${pass} (скопійовано)`);
                }}
                variant="outline"
                className="h-10 px-3 text-xs font-bold rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 shrink-0"
                title="Згенерувати випадковий приклад"
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
              </Button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={pwFilter}
                onChange={(e) => setPwFilter(e.target.value)}
                inputMode="numeric"
                placeholder="Пошук за номером команди..."
                className="h-10 pl-9 text-xs rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {filtered.map((p) => (
                <div 
                  key={p.team} 
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 px-3 py-2 transition-colors"
                >
                  <span className="text-xs font-bold font-mono text-white shrink-0 min-w-[36px]">
                    #{p.team}
                  </span>

                  <span className="text-xs font-mono font-bold text-[#FA5A15] tracking-wider truncate flex-1 text-center bg-black/30 py-1 px-2 rounded-lg border border-white/5">
                    {p.password}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Автогенерація в 1 клік */}
                    <button
                      type="button"
                      onClick={() => quickRegenerate(p.team)}
                      disabled={savingPw}
                      className="p-1.5 hover:bg-white/10 active:scale-90 rounded-lg transition-all text-slate-400 hover:text-amber-400 disabled:opacity-50"
                      title="Перегенерувати 2 укр слова"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    {/* Ручне редагування */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditDialogTeam(p.team);
                        setCustomPassword(p.password);
                      }}
                      className="p-1.5 hover:bg-white/10 active:scale-90 rounded-lg transition-all text-slate-400 hover:text-white"
                      title="Редагувати або вписати свій пароль"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Копіювання */}
                    <button
                      type="button"
                      onClick={() => copySingle(p)}
                      className="p-1.5 hover:bg-white/10 active:scale-90 rounded-lg transition-all text-slate-400 hover:text-emerald-400"
                      title="Скопіювати пароль"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">Команд не знайдено</p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Діалог редагування/генерації пароля */}
      {editDialogTeam !== null && (
        <Dialog open={editDialogTeam !== null} onOpenChange={(open) => !open && setEditDialogTeam(null)}>
          <DialogContent className="bg-[#0F1523] border border-white/10 text-white rounded-3xl max-w-sm mx-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <KeyRound className="w-5 h-5 text-[#FA5A15]" />
                Пароль Команди №{editDialogTeam}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Введіть свій пароль або натисніть чарівну паличку для генерації 2 слів.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Пароль команди</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value.toLowerCase())}
                    placeholder="потяг.гори"
                    className="h-11 rounded-xl bg-white/5 border-white/10 text-white font-mono text-sm"
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      haptics.impact('light');
                      setCustomPassword(generateMemorablePassword());
                    }}
                    variant="outline"
                    className="h-11 px-3 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-[#FA5A15] shrink-0"
                    title="Згенерувати 2 укр слова"
                  >
                    <Wand2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                variant="ghost"
                onClick={() => setEditDialogTeam(null)}
                className="rounded-xl border border-white/10 bg-white/5 text-slate-300 text-xs"
              >
                Скасувати
              </Button>
              <Button
                onClick={() => savePassword(editDialogTeam, customPassword)}
                disabled={savingPw}
                className="bg-[#FA5A15] hover:bg-[#FF7D3B] text-white rounded-xl text-xs font-bold"
              >
                {savingPw ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                Зберегти пароль
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full h-12 font-bold uppercase rounded-2xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 mt-4">
            <Trash2 className="w-4 h-4 mr-2" /> Очистити базу учасників
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-[#0F1523] border border-white/10 text-white rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Видалити всіх учасників?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400">
              Це безповоротно видалить усіх учасників, баланси, історію переведень та сповіщення. Самі зміни залишаться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-slate-300 rounded-xl text-xs">Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={wipe} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold">
              Так, очистити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DataTab;
