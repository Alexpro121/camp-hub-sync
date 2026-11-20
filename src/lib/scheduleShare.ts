import type { NormalizedScheduleItem } from './schedule';
import { sentenceCase } from './scheduleCategories';
import type { ScheduleSubSlot } from '@/types/app';

const WEEKDAYS_FULL = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

const EMOJI: Record<string, string> = {
  meal: '🍽', sports: '⚽️', entertainment: '🎉', gathering: '👥', transfer: '🚌', general: '🔹',
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface ScheduleShareInput {
  dateISO: string;
  team: number | null;
  events: NormalizedScheduleItem[];
  /** Sub-slots that passed validation for an event (same rule as the card). */
  slotsOf: (e: NormalizedScheduleItem) => ScheduleSubSlot[];
}

export function scheduleHeading(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`);
  const wd = WEEKDAYS_FULL[d.getDay()];
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

type Line = { text: string; bold?: boolean };

function buildLines({ dateISO, team, events, slotsOf }: ScheduleShareInput): Line[] {
  const lines: Line[] = [
    { text: `📅 Розклад · ${scheduleHeading(dateISO)}`, bold: true },
    { text: team != null ? `👥 Команда ${team}` : '👥 Усі команди' },
    { text: '' },
  ];
  if (!events.length) {
    lines.push({ text: 'Подій на цей день немає' });
    return lines;
  }
  for (const e of events) {
    const item = e.item;
    const icon = EMOJI[item.category || 'general'] ?? EMOJI.general;
    lines.push({ text: `${icon} ${e.timeStart}–${e.timeEnd}  ${sentenceCase(item.title)}`, bold: true });
    if (item.location) lines.push({ text: `     📍 ${item.location}` });
    const slots = slotsOf(e);
    const mine = team != null ? slots.find((s) => s.teams?.map(Number).includes(Number(team))) : undefined;
    if (mine) lines.push({ text: `     ⏰ Ваш час: ${mine.time}` });
    else for (const s of slots) lines.push({ text: `     ⏰ ${s.time} → команди ${s.teams.join(', ')}` });
    if (!slots.length && team == null && item.target_teams?.length) {
      lines.push({ text: `     👥 Команди ${item.target_teams.join(', ')}` });
    }
    if (item.description) lines.push({ text: `     ${item.description.trim()}` });
  }
  return lines;
}

/** Plain text for Telegram: emoji structure survives any paste target. */
export function scheduleToText(input: ScheduleShareInput): string {
  return buildLines(input).map((l) => l.text).join('\n').trim();
}

/** Same content as HTML so Telegram keeps bold event titles on paste. */
export function scheduleToHtml(input: ScheduleShareInput): string {
  return buildLines(input)
    .map((l) => (l.bold ? `<b>${escapeHtml(l.text)}</b>` : escapeHtml(l.text)))
    .join('<br>');
}

/** Copies rich text when the browser allows it, plain text otherwise. */
export async function copyRich(text: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return true;
    }
  } catch { /* fall through to plain text */ }
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to legacy copy */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
