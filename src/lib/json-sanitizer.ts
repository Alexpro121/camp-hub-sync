/**
 * Robust JSON sanitizer for AI Studio pasted schedule output.
 * Strips markdown fences, surrounding prose and illegal control characters
 * before parsing.
 */
export function cleanAndParseScheduleJson(rawInput: string): any {
  if (!rawInput || typeof rawInput !== "string") {
    throw new Error("Текст порожній");
  }

  let cleaned = rawInput.trim();

  // 1. Remove markdown code fences (```json ... ``` or ``` ... ```)
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // 2. Drop any prose before/after the JSON object
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > 0 || (last !== -1 && last < cleaned.length - 1)) {
    if (first !== -1 && last !== -1 && last > first) {
      cleaned = cleaned.slice(first, last + 1);
    }
  }

  // 3. Replace unescaped control characters (newlines inside strings, etc.)
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
    if (match === "\n" || match === "\r" || match === "\t") return " ";
    return "";
  });

  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    // 4. Last-resort repairs: trailing commas and smart quotes
    const repaired = cleaned
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    return JSON.parse(repaired);
  }
}
