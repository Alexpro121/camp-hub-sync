import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SupervisorFairView from './SupervisorFairView';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  myTeam: number | null;
}

/** Fair register opens as an explicit sheet — never a blank tab. */
const SupervisorFairModal = ({ isOpen, onClose, myTeam }: Props) => (
  <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
    <SheetContent
      side="bottom"
      className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border/50 bg-background/95 backdrop-blur-xl px-3 pb-8"
    >
      <SheetHeader className="text-left">
        <SheetTitle className="text-base font-semibold tracking-tight">Каса стенду · Ярмарок</SheetTitle>
      </SheetHeader>
      <div className="mt-3">
        <SupervisorFairView myTeam={myTeam} />
      </div>
    </SheetContent>
  </Sheet>
);

export default SupervisorFairModal;