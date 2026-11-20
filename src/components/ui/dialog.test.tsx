import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from './dialog';

const renderDialog = (onOpenChange: (open: boolean) => void) => render(
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent aria-describedby={undefined}>
      <DialogTitle>Нотатка</DialogTitle>
      <textarea aria-label="Текст" />
    </DialogContent>
  </Dialog>,
);

// Radix починає слухати дотики поза вікном через такт після відкриття.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('dialogs keep typed input on phones', () => {
  it('closes on an outside tap while nothing was typed', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    await tick();
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ignores an accidental outside tap once something was typed', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    fireEvent.input(screen.getByLabelText('Текст'), { target: { value: 'алергія' } });
    await tick();
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();
    // Явне закриття хрестиком працює.
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
