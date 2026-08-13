import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Layers } from 'lucide-react';
import { useActiveShift } from '@/context/ActiveShiftContext';
import { CATEGORY_LABELS, shiftCategoryOf } from '@/lib/shift-resolver';
import { shiftStatus } from '@/lib/shift';
import { useHaptics } from '@/hooks/useHaptics';

/** Glass selector that re-scopes every admin surface to one shift, instantly. */
const ActiveShiftSwitcher = () => {
  const { shifts, shiftId, shift, setShiftId } = useActiveShift();
  const haptics = useHaptics();

  if (!shifts.length) return null;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-2.5 py-2 backdrop-blur-xl">
      <Layers className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.75} />
      <Select
        value={shiftId ?? undefined}
        onValueChange={(v) => { haptics.selection(); setShiftId(v); }}
      >
        <SelectTrigger className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs font-semibold focus:ring-0">
          <SelectValue placeholder="Оберіть зміну" />
        </SelectTrigger>
        <SelectContent>
          {shifts.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              {s.name} · {CATEGORY_LABELS[shiftCategoryOf(s)]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {shift && (
        <Badge variant="outline" className="shrink-0 text-[9px] uppercase tracking-wider">
          {shiftStatus(shift) === 'active' ? 'Активна' : shiftStatus(shift) === 'upcoming' ? 'Майбутня' : 'Завершена'}
        </Badge>
      )}
    </div>
  );
};

export default ActiveShiftSwitcher;
