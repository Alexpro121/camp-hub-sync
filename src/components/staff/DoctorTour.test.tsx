import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DoctorTour from './DoctorTour';
afterEach(cleanup);
it('closes the child profile when jumping back to the shift selector', () => {
  const actions = { closeChild: vi.fn(), openFirstChild: vi.fn(), setMarked: vi.fn() };
  render(<DoctorTour open onClose={vi.fn()} actions={actions} />);
  fireEvent.click(screen.getByRole('button', { name: /^Крок 7$/ }));
  expect(actions.openFirstChild).toHaveBeenCalledTimes(1);
  actions.closeChild.mockClear();
  fireEvent.click(screen.getByRole('button', { name: /^Крок 3$/ }));
  expect(actions.closeChild).toHaveBeenCalledTimes(1);
});