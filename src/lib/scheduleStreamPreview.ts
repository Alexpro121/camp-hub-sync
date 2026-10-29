/** Read only fully closed event objects. Never repair a truncated event into a live card. */
export class ScheduleStreamPreview {
  private text = '';
  private index = 0;
  private quoted = false;
  private escaped = false;
  private objects: number[] = [];
  private events: Record<string, unknown>[] = [];

  constructor(private readonly fallbackDate: string) {}

  update(text: string): string | null {
    if (!text.startsWith(this.text)) throw new Error('Schedule stream must append text');
    this.text = text;
    const previous = this.events.length;
    for (; this.index < text.length; this.index++) {
      const char = text[this.index];
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.quoted = false;
        continue;
      }
      if (char === '"') { this.quoted = true; continue; }
      if (char === '{') this.objects.push(this.index);
      if (char !== '}') continue;
      const start = this.objects.pop();
      if (start == null) continue;
      let value: unknown;
      try { value = JSON.parse(text.slice(start, this.index + 1)); } catch { continue; }
      if (typeof value !== 'object' || value === null || !('title' in value) || !('time_start' in value)) continue;
      let date = this.fallbackDate;
      for (const parent of [...this.objects].reverse()) {
        const match = text.slice(parent, start).match(/^\{\s*"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
        if (match?.[1]) { date = match[1]; break; }
      }
      this.events.push({ ...value, date });
    }
    return previous === this.events.length ? null : JSON.stringify(this.events);
  }
}