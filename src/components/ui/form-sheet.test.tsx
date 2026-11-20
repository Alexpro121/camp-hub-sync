import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import FormSheet from './form-sheet';

type Listener = () => void;
const listeners = new Set<Listener>();
const viewport = { height: 812, offsetTop: 0, addEventListener: (_: string, fn: Listener) => listeners.add(fn), removeEventListener: (_: string, fn: Listener) => listeners.delete(fn) };

function phone() {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: /max-width/.test(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList);
}

afterEach(() => { vi.restoreAllMocks(); listeners.clear(); viewport.height = 812; });

describe('FormSheet on a phone', () => {
  it('sits above the iOS keyboard and keeps the action button reachable', () => {
    phone();
    render(
      <FormSheet open onOpenChange={() => {}} title="Нова подія" footer={<button>Зберегти</button>}>
        <input aria-label="Назва" />
      </FormSheet>,
    );
    const sheet = screen.getByRole('dialog');
    expect(sheet.style.bottom).toBe('0px');

    // iOS: клавіатура накриває 332px, сторінка не стискається.
    act(() => { viewport.height = 480; listeners.forEach((fn) => fn()); });
    expect(sheet.style.bottom).toBe('332px');
    expect(sheet.style.maxHeight).toBe('472px');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeTruthy();
  });

  it('does not grab focus on open, so the keyboard stays hidden until a field is tapped', () => {
    phone();
    render(
      <FormSheet open onOpenChange={() => {}} title="Нова подія" footer={<button>Зберегти</button>}>
        <input aria-label="Назва" />
      </FormSheet>,
    );
    expect(document.activeElement).not.toBe(screen.getByLabelText('Назва'));
  });
});
