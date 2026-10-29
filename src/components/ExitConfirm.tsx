import * as React from 'react';
import { LogOut } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface Props {
  /** Виконується лише після підтвердження */
  onConfirm: () => void;
  /** Тригер — існуюча кнопка «Вийти» (стиль не змінюється) */
  children: React.ReactNode;
  title?: string;
  description?: string;
  confirmLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Єдине підтвердження виходу для всіх кнопок «Вийти» в застосунку. */
export default function ExitConfirm({
  onConfirm,
  children,
  title = 'Вийти з акаунта?',
  description = 'Ви впевнені? Після виходу потрібно буде увійти знову.',
  confirmLabel = 'Так, вийти',
  open,
  onOpenChange,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent className="max-w-sm rounded-3xl border-border/80 p-5 sm:p-6 sm:rounded-3xl data-[state=open]:zoom-in-95">
        <AlertDialogHeader className="items-center sm:items-start space-y-3">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"
          >
            <LogOut className="h-6 w-6" strokeWidth={2.2} />
          </span>
          <AlertDialogTitle className="text-lg font-bold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel className="mt-0 rounded-xl">Скасувати</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
