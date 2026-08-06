import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { pickActiveShift } from '@/lib/shift';
import type { Shift } from '@/types/app';

/** Publish switch (admin) / status badge (supervisor) for the train allocation. */
const TrainPublishStatus = ({ editable = false }: { editable?: boolean }) => {
  const [shift, setShift] = useState<(Shift & { train_coupes_published?: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('shifts').select('*').is('deleted_at', null);
      if (!alive) return;
      setShift(pickActiveShift((data || []) as unknown as Shift[]) as any);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const published = !!shift?.train_coupes_published;

  const toggle = async (next: boolean) => {
    if (!shift) return;
    setBusy(true);
    const { error } = await supabase.from('shifts').update({ train_coupes_published: next }).eq('id', shift.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setShift({ ...shift, train_coupes_published: next });
    toast.success(next ? 'Розселення опубліковано для дітей' : 'Розселення приховано від дітей');
  };

  if (loading) return null;

  return (
    <Card className="p-4 bg-card/80 backdrop-blur-md border-border/50 flex items-center gap-3">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${published ? 'bg-primary shadow-glow' : 'bg-muted-foreground/40'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">
          {published ? 'Опубліковано' : 'Приховано'}
        </p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          {published ? 'Діти бачать свої купе' : 'Бачить лише персонал (режим очікування)'}
        </p>
      </div>
      {editable && (
        busy
          ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
          : <Switch checked={published} onCheckedChange={toggle} aria-label="Опублікувати розселення" />
      )}
    </Card>
  );
};

export default TrainPublishStatus;