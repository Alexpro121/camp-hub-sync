/**
 * Builds a strict, copy-paste ready prompt for Google AI Studio / Gemini so an
 * admin can convert a raw Ukrainian camp schedule into importable JSON.
 */
export function generateAiStudioSchedulePrompt(rawText: string, date: string): string {
  return `You are a master Ukrainian youth camp schedule JSON parser.
Convert the unstructured raw text schedule for date "${date}" into a STRICT, VALID JSON object.

JSON OUTPUT SCHEMA (STRICT REQUIREMENT - RETURN ONLY VALID JSON, NO MARKDOWN, NO CODE FENCES):
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
      "has_sub_slots": false,
      "sub_slots": [
        { "time": "HH:MM", "teams": [1, 2] }
      ]
    }
  ]
}

PARSING RULES & LOCATIONS:
1. LOCATIONS: Extract locations from event text (e.g. "(велика зала)") OR from notes at the bottom (e.g. "*Тактична медицина - велика зала, бассейн" -> location: "Велика зала, басейн").
2. CATEGORY 'fair': If title/description mentions 'ярмарок', 'ярмарка', 'ярмарка-продаж', 'маркет' -> category MUST BE "fair".
3. CATEGORIES:
   - "meal": сніданок, обід, вечеря, чай, смаколики.
   - "sports": зарядка, йога, спорт, тактична медицина, скелелазіння.
   - "gathering": свічка, сінемалогія, концерт, акторська майстерність, розпис футболок, KSE, паракорди.
   - "transfer": виїзд, буковель, потяг, трансфер.
4. CIRCULAR SYSTEMS (Колова система): Parse parallel workshop blocks per team accurately with start/end times, team numbers in 'target_teams', and assigned location.
5. TIMES: Standardize all times to HH:MM format. If time_end is missing, estimate reasonable time_end.

RAW TEXT SCHEDULE TO PARSE:
${rawText}
`;
}