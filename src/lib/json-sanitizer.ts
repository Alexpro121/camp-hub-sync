/**
 * Інтелектуальний санітайзер та парсер JSON, згенерованого штучним інтелектом (AI Studio, ChatGPT, Claude, Groq).
 * Видаляє markdown-блоки, вступний/заключний текст, коментарі, виправляє лапки,
 * хвостові коми, сирі переноси рядків та незалапковані ключі.
 */
export function cleanAndParseScheduleJson<T = any>(rawInput: string): T {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error('Вхідний текст порожній або не є рядком');
  }

  // 1. Попередня дезінфекція сміттєвих символів копіювання / HTML
  let text = rawInput
    .replace(/\uFEFF/g, '') // Видалення BOM
    .replace(/[\u200B\u200C\u200D\u2060]/g, '') // Zero-width spaces
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;|\u00A0/g, ' ') // Нерозривні пробіли
    .trim();

  // 2. Витягування чистого JSON з Markdown код-блоків або навколишнього тексту
  text = extractJsonBlock(text);

  // 3. Спроба 1: Швидкий нативний парсинг (якщо JSON уже валідний)
  try {
    return JSON.parse(text) as T;
  } catch {
    /* переходимо до ремонту */
  }

  // 4. Спроба 2: М'який ремонт (лапки, коментарі, екранування невидимих переносів)
  let repaired = text;
  repaired = stripJsonComments(repaired);
  repaired = normalizeQuotes(repaired);
  repaired = sanitizeStringLiterals(repaired);
  repaired = removeTrailingCommas(repaired);

  try {
    return JSON.parse(repaired) as T;
  } catch {
    /* переходимо до агресивного ремонту */
  }

  // 5. Спроба 3: Агресивний ремонт (незалапковані ключі та одинарні лапки в стилі JS Object)
  repaired = repairRelaxedJson(repaired);

  try {
    return JSON.parse(repaired) as T;
  } catch (finalError: any) {
    console.error('JSON Repair Failed. Sanitized payload was:\n', repaired);
    throw new Error(
      `Не вдалося розпарсити розклад від AI: ${finalError?.message || 'Некоректна структура JSON'}`
    );
  }
}

/* ==========================================================================
   Допоміжні утиліти обробки JSON
   ========================================================================== */

/**
 * Знаходить межі JSON (об'єкт `{...}` або масив `[...]`), ігноруючи текст до і після
 */
function extractJsonBlock(text: string): string {
  // Перевірка наявності Markdown блоку ```json ... ``` або ``` ... ```
  const fenceMatch = text.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  // Визначаємо, що починається раніше: об'єкт чи масив
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.slice(startIdx, endIdx + 1).trim();
  }

  return text;
}

/**
 * Безпечно видаляє однорядкові (//) та багаторядкові (/* *\/) коментарі,
 * не чіпаючи URL-адреси всередині рядків (наприклад, "https://...")
 */
function stripJsonComments(str: string): string {
  let inString = false;
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
    } else if (!inString) {
      // Однорядковий коментар //
      if (char === '/' && nextChar === '/') {
        const nextNewline = str.indexOf('\n', i);
        if (nextNewline === -1) break;
        i = nextNewline;
        continue;
      }
      // Багаторядковий коментар /* ... */
      if (char === '/' && nextChar === '*') {
        const endComment = str.indexOf('*/', i + 2);
        if (endComment === -1) break;
        i = endComment + 1;
        continue;
      }
      result += char;
    } else {
      if (char === '\\') {
        isEscaped = !isEscaped;
      } else {
        isEscaped = false;
      }
      result += char;
    }
  }

  return result;
}

/**
 * Нормалізує друкарські «розумні» лапки до стандартних ASCII
 */
function normalizeQuotes(str: string): string {
  return str
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"') // “ ” „ « » -> "
    .replace(/[\u2018\u2019\u201A\u02BC]/g, "'");       // ‘ ’ ‚ ʼ -> '
}

/**
 * Проходить по тексту як State Machine і екранує сирі переноси рядків/символи контролю
 * ТІЛЬКИ всередині значень рядків ("..."), залишаючи відступи JSON непошкодженими.
 */
function sanitizeStringLiterals(str: string): string {
  let inString = false;
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
    } else if (inString) {
      if (char === '\\') {
        isEscaped = !isEscaped;
        result += char;
      } else {
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else if (char.charCodeAt(0) < 32) {
          // Ігноруємо недопустимі керуючі символи ASCII 0-31
        } else {
          result += char;
        }
        isEscaped = false;
      }
    } else {
      isEscaped = false;
      result += char;
    }
  }

  return result;
}

/**
 * Видаляє зайві коми перед закриваючими дужками (trailing commas)
 */
function removeTrailingCommas(str: string): string {
  return str.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Ремонтує JS-подібний об'єктний синтаксис (одинарні лапки та незалапковані ключі)
 */
function repairRelaxedJson(str: string): string {
  let out = str;

  // Заміна одинарних лапок на подвійні: 'text' -> "text"
  out = out.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

  // Лапкування ключів без лапок: { time: "10:00", event_name: "Обід" } -> { "time": "10:00", "event_name": "Обід" }
  out = out.replace(/([{,]\s*)([a-zA-Z0-9_$-]+)\s*:/g, '$1"$2":');

  // Повторне очищення хвостових ком
  out = removeTrailingCommas(out);

  return out;
}
