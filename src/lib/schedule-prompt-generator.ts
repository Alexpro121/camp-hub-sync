/**
 * Builds a strict, copy-paste ready prompt for Google AI Studio / Gemini so an
 * admin can convert a raw Ukrainian camp schedule into importable JSON.
 */
export function generateAiStudioSchedulePrompt(rawText: string, date: string): string {
  return `You are a master Ukrainian youth camp schedule JSON generator.
Convert the unstructured raw text schedule for date "${date}" into a STRICT, VALID, SINGLE-LINE CLEAN JSON object.

JSON OUTPUT SCHEMA (STRICT REQUIREMENT - RETURN ONLY PURE VALID JSON, NO MARKDOWN, NO CODE FENCES, NO LITERAL NEWLINES INSIDE STRINGS):
{
  "date": "${date}",
  "items": [
    {
      "time_start": "HH:MM",
      "time_end": "HH:MM",
      "title": "Clean event title without location or time",
      "location": "Location name extracted from text/notes or null",
      "category": "fair" | "meal" | "sports" | "gathering" | "transfer" | "general",
      "target_teams": [],
      "has_sub_slots": boolean,
      "sub_slots": [
        { "time": "HH:MM", "teams": [1, 2] }
      ]
    }
  ]
}

PARSING RULES & LOCATIONS:
1. LOCATIONS MAPPING (notes at the bottom of the raw text):
   - 'Тактична медицина' -> location: "Велика зала, басейн, зал для боротьби"
   - 'KSE' -> location: "Зал АВ"
   - 'Акторська майстерність' -> location: "Дзеркальна зала"
   - 'Паракорди' -> location: "Зал СД"
   - 'Розпис футболок' -> location: "Цегляна зала"
   - Extract any other location in parentheses, e.g. "(велика зала)". If unknown -> null.
2. CATEGORY RULES:
   - "fair": ярмарок, ярмарка, ярмарка-продаж, маркет, продаж.
   - "meal": сніданок, обід, вечеря, чай, смаколики.
   - "sports": зарядка, йога, спорт, тактична медицина, басейн, скелелазіння.
   - "gathering": свічка, сінемалогія, концерт, акторська майстерність, розпис футболок, KSE, паракорди.
   - "transfer": виїзд, буковель, потяг, трансфер.
   - otherwise "general".
3. CIRCULAR SYSTEMS (Колова система): parse parallel workshops for specific teams into separate events with their exact 'target_teams' array (e.g. target_teams: [1]) plus start/end times and assigned location.
4. TIMES: standardize all times to HH:MM. If time_end is missing, estimate a reasonable time_end.

RAW TEXT SCHEDULE TO PARSE:
${rawText}
`;
}