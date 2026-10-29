import { jsonrepair } from 'jsonrepair';
import { ScheduleJsonSchema, type Result } from '@/lib/schemas/apiSchemas';

/** Recover copied JSON without regex replacements inside user-authored strings. */
export function cleanAndParseScheduleJson(rawInput: string): unknown {
  if (!rawInput?.trim()) throw new Error('Вставте JSON розкладу');
  if (rawInput.length > 1_000_000) throw new Error('JSON завеликий — імпортуйте розклад частинами');
  const text = rawInput.replace(/^\uFEFF/, '').trim();
  const fenced = text.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? extractJson(text);
  let data: unknown;
  try { data = JSON.parse(candidate); }
  catch { data = JSON.parse(jsonrepair(candidate)); }
  const validated = ScheduleJsonSchema.safeParse(data);
  if (!validated.success) throw new Error('JSON розкладу має бути об’єктом або масивом');
  return validated.data;
}

export function safeParseScheduleJson(rawInput: string): Result<unknown> {
  try { return { ok: true, value: cleanAndParseScheduleJson(rawInput) }; }
  catch (error: unknown) {
    return { ok: false, error: { code: 'schedule_json', message: error instanceof Error ? error.message : 'Некоректний JSON' } };
  }
}

/** Find one balanced document; braces inside quoted descriptions are not boundaries. */
function extractJson(text: string): string {
  const start = text.search(/[\[{]/);
  if (start < 0) return text;
  const stack: string[] = [];
  let quote = '';
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      stack.pop();
      if (!stack.length) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}
