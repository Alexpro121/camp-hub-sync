import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { keepFocusedFieldVisible, useVisualViewport } from '@/hooks/useVisualViewport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Кнопки дії — завжди видно, навіть із відкритою клавіатурою. */
  footer: ReactNode;
  /** Є незбережені зміни: випадковий дотик поза формою її не закриває. */
  dirty?: boolean;
  className?: string;
}

/**
 * Форма, зручна на телефоні: нижня шторка над клавіатурою з кнопками, що не ховаються.
 * На широкому екрані — звичайне вікно по центру.
 */
/** Enter у полі (не в багаторядковому тексті) — до наступного поля; на останньому — ховаємо клавіатуру. */
function nextFieldOnEnter(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  if (event.key !== 'Enter' || target.tagName !== 'INPUT' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([disabled]), textarea:not([disabled])')];
  const next = fields[fields.indexOf(target) + 1];
  if (next) next.focus();
  else target.blur();
}

export function FormSheet({ open, onOpenChange, title, description, children, footer, dirty = false, className }: Props) {
  const mobile = useIsMobile(640);
  const viewport = useVisualViewport(open && mobile);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => (open ? keepFocusedFieldVisible(bodyRef.current) : undefined), [open, mobile]);

  const keyboard = !!viewport?.keyboard;
  const sheetStyle = mobile && viewport
    ? { bottom: viewport.keyboardInset, maxHeight: Math.max(240, viewport.height - (keyboard ? 8 : 24)) }
    : undefined;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          // На телефоні не відкриваємо клавіатуру одразу — спершу людина бачить усю форму.
          onOpenAutoFocus={(event) => { if (mobile) event.preventDefault(); }}
          onInteractOutside={(event) => { if (dirty) event.preventDefault(); }}
          onEscapeKeyDown={(event) => { if (dirty && mobile) event.preventDefault(); }}
          style={sheetStyle}
          className={cn(
            'fixed z-50 flex flex-col border bg-background shadow-2xl outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl transition-[bottom,max-height] duration-150',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:max-h-[calc(100dvh-2rem)]',
            'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95',
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden />
          <div className="flex shrink-0 items-start gap-2 border-b border-border/60 px-4 pb-3 pt-2 sm:pt-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-bold leading-tight">{title}</DialogPrimitive.Title>
              {description
                ? <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">{description}</DialogPrimitive.Description>
                : <DialogPrimitive.Description className="sr-only">Форма</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close aria-label="Закрити" className="-mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div ref={bodyRef} onKeyDown={nextFieldOnEnter} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [scroll-padding-block:4rem]">
            {children}
          </div>
          <div className={cn('shrink-0 border-t border-border/60 bg-background px-4 pt-3', keyboard ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]')}>
            {footer}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default FormSheet;
