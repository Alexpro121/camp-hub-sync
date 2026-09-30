import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type State = { error: Error | null };

/** Ловить збої екранів, щоб застосунок не падав у білий екран. */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[AppErrorBoundary]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <p className="text-lg font-bold">Щось пішло не так</p>
        <p className="max-w-xs text-sm text-muted-foreground">Ваші дані збережено. Спробуйте ще раз або перезавантажте сторінку.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>Спробувати ще</Button>
          <Button onClick={() => window.location.reload()}>Перезавантажити</Button>
        </div>
      </div>
    );
  }
}
