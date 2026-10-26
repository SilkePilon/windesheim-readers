// Pure helpers for AI-generated reader content (no DB access, unit-tested).

export interface ProposedLesson {
  code: string;
  title: string;
  week: number;
  startPage: number;
  endPage: number;
}

const LETTER_PART = /^(\d+(?:\.\d+)*)\s*[a-z]$/i;

/** One lesson per paragraph: collapses AI codes like 1.2A + 1.2B into "1.2" (adjacent parts only). */
export function mergeLetterParts(lessons: ProposedLesson[]): ProposedLesson[] {
  const out: ProposedLesson[] = [];
  for (const l of lessons) {
    const code = l.code.trim().match(LETTER_PART)?.[1] ?? l.code.trim();
    const prev = out.at(-1);
    if (prev && prev.code === code) {
      prev.startPage = Math.min(prev.startPage, l.startPage);
      prev.endPage = Math.max(prev.endPage, l.endPage);
    } else {
      out.push({ ...l, code });
    }
  }
  return out;
}

export interface QuestionCounts {
  mc: number;
  tf: number;
  fill: number;
  open: number;
  ordering: [number, number];
  flashcards: [number, number];
}

/** How much to generate for a lesson, based on how many reader pages it covers. */
export function questionCounts(pages: number): QuestionCounts {
  if (pages <= 5) return { mc: 8, tf: 4, fill: 3, open: 3, ordering: [0, 1], flashcards: [12, 18] };
  if (pages <= 12) return { mc: 12, tf: 6, fill: 4, open: 4, ordering: [0, 2], flashcards: [18, 25] };
  return { mc: 16, tf: 8, fill: 5, open: 5, ordering: [0, 2], flashcards: [25, 35] };
}

const keepCase = (match: string, replacement: string) =>
  match[0] === match[0]!.toUpperCase() && match[0] !== match[0]!.toLowerCase()
    ? replacement[0]!.toUpperCase() + replacement.slice(1)
    : replacement;

const NL_RULES: [RegExp, string][] = [
  // "volgens de tekst", "zoals in de tekst", "uit de brontekst", "zoals beschreven in het tekstfragment"
  [
    /\b(volgens|uit|zoals in|zoals beschreven in|zoals genoemd in|zoals vermeld in|zoals besproken in|beschreven in)\s+(?:de|het)\s+(?:gegeven |bovenstaande |aangeleverde )?(?:tekstfragment|brontekst|tekst|fragment)\b/gi,
    "$1 de reader",
  ],
  // "in de tekst genoemd/staat/wordt …" — but not "fouten in de tekst van de klant"
  [/\bin\s+de\s+tekst(?=\s+(?:staat|staan|wordt|worden|genoemd|beschreven|vermeld|besproken|gegeven)\b)/gi, "in de reader"],
  // "de gegeven tekst", "het bovenstaande fragment", "de brontekst", "het tekstfragment"
  [/\b(?:de|het)\s+(?:gegeven|bovenstaande|aangeleverde)\s+(?:tekstfragment|tekst|fragment)\b/gi, "de reader"],
  [/\b(?:de\s+brontekst|het\s+tekstfragment)\b/gi, "de reader"],
];

const EN_RULES: [RegExp, string][] = [
  [
    /\b(according to|in|from|as described in|as stated in|as mentioned in|described in)\s+the\s+(?:given\s+|above\s+|provided\s+)?(?:source text|text|passage|excerpt)(?:\s+above)?\b/gi,
    "$1 the reader",
  ],
  [/\bthe\s+(?:given|above|provided)\s+(?:text|passage|excerpt)\b/gi, "the reader"],
];

/** Students only see the reader, never the AI's input: refer to "de reader", not "de tekst". */
export function readerWording(s: string, language: string): string {
  const rules = language === "en" ? EN_RULES : NL_RULES;
  let out = s;
  for (const [re, rep] of rules) {
    out = out.replace(re, (match, ...groups) => {
      const g1 = typeof groups[0] === "string" ? groups[0] : "";
      return keepCase(match, rep.replace("$1", g1));
    });
  }
  return out;
}

/** Prompt rule shared by every generator that writes student-facing text. */
export function readerReferenceRule(language: string) {
  return language === "en"
    ? `- Students only see the reader, never your input. When you refer to the source, always say "the reader" (e.g. "as stated in the reader"), never "the text", "the passage" or "the excerpt".`
    : `- Studenten zien alleen de reader, nooit jouw invoer. Verwijs naar de bron altijd als "de reader" (bv. "zoals in de reader staat", "volgens de reader"), nooit als "de tekst", "het fragment" of "de gegeven tekst".`;
}
