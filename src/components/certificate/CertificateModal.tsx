import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  initialName: string;
}

export const CertificateModal = ({ open, onClose, initialName }: Props) => {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Сертифікат</DialogTitle>
          <DialogDescription>
            {initialName ? `Учасник: ${initialName}` : 'Твій персональний сертифікат'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-6 text-center text-sm text-muted-foreground">
          Генерація сертифіката буде тут.
        </div>
      </DialogContent>
    </Dialog>
  );
};
