import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { staffCall } from '@/lib/staffApi';

/** Обов'язкова зміна тимчасового пароля після скидання адміністратором. */
export default function ForcePasswordChange({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
  const [pass, setPass] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = pass && pass.length < 6 ? 'Мінімум 6 символів' : repeat && pass !== repeat ? 'Паролі не збігаються' : '';

  const save = async () => {
    if (busy || error || !pass || pass !== repeat) return;
    setBusy(true);
    try {
      const r = await staffCall<{ ok?: boolean; error?: string }>({ action: 'change_password', password: pass });
      if (r?.error) throw new Error(r.error);
      toast.success('Пароль оновлено');
      onDone();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      toast.error(code === 'same_password' ? 'Новий пароль має відрізнятися від тимчасового' : code === 'weak_password' ? 'Пароль занадто простий' : 'Не вдалося оновити пароль');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm rounded-2xl [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center mb-1"><KeyRound className="w-5 h-5" /></div>
          <DialogTitle>Оновіть пароль</DialogTitle>
          <DialogDescription>Адміністратор видав тимчасовий пароль. Придумайте власний, щоб продовжити.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="np">Новий пароль</Label>
            <div className="relative">
              <Input id="np" type={show ? 'text' : 'password'} autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} className="h-12 rounded-xl pr-11" autoFocus />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Сховати пароль' : 'Показати пароль'} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-muted-foreground">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np2">Повторіть пароль</Label>
            <Input id="np2" type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className="h-12 rounded-xl" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full h-12 rounded-xl" disabled={busy || !!error || !pass || pass !== repeat}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Зберегти пароль'}
          </Button>
          <button type="button" onClick={onLogout} className="w-full text-xs text-muted-foreground py-1">Вийти</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
