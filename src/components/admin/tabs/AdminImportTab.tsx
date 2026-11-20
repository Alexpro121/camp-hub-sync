import { fetchAllRows } from '@/lib/fetchAll';
import { useEffect, useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useHaptics } from '@/hooks/useHaptics';

/* База даних: лічильники та очищення учасників */
const DataTab = () => {
  const [count, setCount] = useState(0);
  const [teamsCount, setTeamsCount] = useState(0);
  const haptics = useHaptics();

  const load = async () => {
    const [{ count: total }, { data }] = await Promise.all([
      supabase.from('children').select('id', { count: 'exact', head: true }),
      fetchAllRows<{ team_number: number }>(() => supabase.from('children').select('team_number').order('id')),
    ]);
    setCount(total ?? data.length);
    setTeamsCount(new Set((data || []).map((d: any) => d.team_number)).size);
  };
  useEffect(() => { load(); }, []);

  const wipe = async () => {
    const NIL = '00000000-0000-0000-0000-000000000000';
    // Спочатку залежні таблиці, учасників — останніми: інакше зовнішні ключі блокують видалення.
    const dependents = ['transfer_requests', 'transfers', 'iron_dollar_transactions', 'train_coupes', 'uploaded_files', 'notifications'] as const;
    const failed: string[] = [];
    for (const table of dependents) {
      const { error } = await supabase.from(table).delete().neq('id', NIL);
      if (error) failed.push(`${table}: ${error.message}`);
    }
    const { error: childrenError } = await supabase.from('children').delete().neq('id', NIL);
    if (childrenError) failed.push(`children: ${childrenError.message}`);
    if (failed.length) {
      haptics.notification('error');
      toast.error(`Очищення виконано не повністю (${failed.length}): ${failed[0]}`);
    } else {
      haptics.notification('success');
      toast.success('Базу успішно очищено');
    }
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
