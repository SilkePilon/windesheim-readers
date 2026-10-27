// Pure helpers for the "luisterles" (spoken lesson summary): script schema, prompt rules,
// normalisation and TTS input chunking. No DB or network access (unit-tested).
import { z } from "zod";
import { readerReferenceRule, readerWording } from "./content-rules";

export const CHAPTER_KINDS = ["hook", "roadmap", "idea", "recap", "quiz"] as const;
export type ChapterKind = (typeof CHAPTER_KINDS)[number];

export interface ScriptChapter {
  kind: ChapterKind;
  /** Internal; never shown to students. */
  title: string;
  /** TTS-ready spoken text. */
  text: string;
}

export interface AudioScript {
  chapters: ScriptChapter[];
  /** True when the examples were grounded through provider web search. */
  grounded: boolean;
  /** Source URLs the grounding step returned (admin quality control only). */
  sources: string[];
}

export const scriptSchema = z.object({
  chapters: z
    .array(
      z.object({
        kind: z.enum(CHAPTER_KINDS).describe("hook | roadmap | idea | recap | quiz"),
        title: z.string().describe("Korte interne titel van dit deel (wordt niet voorgelezen)"),
        text: z.string().describe("De uitgesproken tekst van dit deel, klaar voor tekst-naar-spraak"),
      }),
    )
    .describe("In deze volgorde: 1 hook, 1 roadmap, 3-5 idea, 1 recap, 1 quiz"),
});

export type RawScript = z.infer<typeof scriptSchema>;

export const MIN_IDEAS = 3;
export const MAX_IDEAS = 5;

/**
 * Validate and tidy a model-written script: trims, drops empty chapters, applies the reader
 * wording rule, merges repeated roadmap/recap/hook, caps ideas at 5. Throws when the script
 * is unusable (no hook/recap/quiz or fewer than 3 ideas).
 */
export function normalizeScript(raw: RawScript, language: string): ScriptChapter[] {
  const w = (s: string) => readerWording(tidySpoken(s), language);
  const chapters = raw.chapters
    .map((c) => ({ kind: c.kind, title: c.title.trim() || c.kind, text: w(c.text) }))
    .filter((c) => c.text.length > 0);
  const one = (kind: ChapterKind) => {
    const list = chapters.filter((c) => c.kind === kind);
    if (!list.length) return null;
    return { ...list[0]!, text: list.map((c) => c.text).join("\n\n") };
  };
  const hook = one("hook");
  const roadmap = one("roadmap");
  const recap = one("recap");
  const quiz = one("quiz");
  const ideas = chapters.filter((c) => c.kind === "idea").slice(0, MAX_IDEAS);
  if (!hook) throw new Error("Script has no hook");
  if (ideas.length < MIN_IDEAS) throw new Error(`Script has ${ideas.length} core ideas (need ${MIN_IDEAS}-${MAX_IDEAS})`);
  if (!recap) throw new Error("Script has no recap");
  if (!quiz) throw new Error("Script has no self-test questions");
  // A one-sentence roadmap is too short for its own chapter: it rides along with the hook.
  const opening = roadmap ? { ...hook, text: `${hook.text}\n\n${roadmap.text}` } : hook;
  return [opening, ...ideas, recap, quiz];
}

/** Strip written-text formatting the TTS would read out loud or stumble over. */
export function tidySpoken(s: string) {
  return s
    .replace(/\*\*|__|`|#+\s/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function wordCount(chapters: { text: string }[]) {
  return chapters.reduce((a, c) => a + c.text.split(/\s+/).filter(Boolean).length, 0);
}

/** Max characters of input per TTS call (OpenAI's hard limit is 4096; Gemini drifts on long inputs). */
export const TTS_MAX_CHARS: Record<"google" | "openai", number> = { google: 3000, openai: 4000 };

/**
 * Split text into pieces of at most `max` characters, preferring paragraph, then sentence,
 * then word boundaries (a single over-long word is hard-cut). Order and content are kept.
 */
export function chunkText(text: string, max: number): string[] {
  const t = text.trim();
  if (t.length <= max) return t ? [t] : [];
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  const add = (piece: string, sep: string) => {
    if (!cur) cur = piece;
    else if (cur.length + sep.length + piece.length <= max) cur += sep + piece;
    else {
      flush();
      cur = piece;
    }
  };
  for (const para of t.split(/\n\s*\n/)) {
    if (para.length <= max) {
      add(para.trim(), "\n\n");
      continue;
    }
    for (const sentence of para.match(/[^.!?…]*[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [para]) {
      const s = sentence.trim();
      if (!s) continue;
      if (s.length <= max) {
        add(s, " ");
        continue;
      }
      for (const word of s.split(/\s+/)) {
        if (word.length <= max) add(word, " ");
        else for (let i = 0; i < word.length; i += max) add(word.slice(i, i + max), "");
      }
    }
  }
  flush();
  return out;
}

/** System prompt for the spoken script (one narrator, ~5-7 minutes). */
export function scriptInstructions(language: string, grounded: boolean) {
  const en = language === "en";
  return `Je bent een ervaren, enthousiaste hbo-docent die een luisterles maakt: een gesproken samenvatting van één paragraaf uit de reader, voorgelezen door één verteller (tekst-naar-spraak). Studenten zien de tekst nooit; ze horen alleen audio.

Taal: schrijf alles in de taal van de reader (taalcode: ${language})${en ? " — so write in English" : ""}.

Opbouw (ongeveer 800-1000 gesproken woorden, 5-7 minuten), als hoofdstukken in deze volgorde:
1. hook (20-30 seconden): een vraag, scenario of verrassend feit uit de echte wereld dat het onderwerp laat leven, en waarom deze paragraaf nuttig is.
2. roadmap (één zin): wat er komt, met signaalwoorden (bv. "drie dingen").
3. idea (3 tot 5 keer, elk 45-90 seconden): één kernidee per hoofdstuk: het idee, een herkenbaar voorbeeld uit de praktijk (Nederlandse context, hbo-praktijk, het werkveld van de student) en waarom het ertoe doet. Begin met een signaalwoord ("Het tweede punt...") en een korte brug naar het vorige idee.
4. recap (ongeveer 30 seconden): de kernideeën, elk in één adem.
5. quiz ("Test jezelf"): 2-3 vragen om in je hoofd te beantwoorden. Na elke vraag een nieuwe regel met alleen "..." als denkpauze, dan het antwoord in één zin.

Stijl (geschreven voor het oor):
- Persoonlijk en conversationeel: spreek de student aan met "je" en gebruik "we". Korte zinnen, spreektaal, afwisselend ritme.
- Geen opsommingstekens, tabellen, kopjes, Markdown of emoji. Nooit "zie figuur" of "in de tabel".
- Getallen afgerond en uitgeschreven zoals je ze zegt ("ruim twintig procent", "bijna een miljoen"); jaartallen mogen als cijfers (1990). Schrijf afkortingen bij eerste gebruik voluit.
- Korte pauzes: een nieuwe regel of "...". Geen regieaanwijzingen tussen haakjes.

Inhoud:
- De kerninhoud komt UITSLUITEND uit de tekst van de paragraaf. Verzin geen feiten over de stof.
${readerReferenceRule(language)}
${
  grounded
    ? `- Voorbeelden uit de echte wereld: gebruik bij voorkeur de aangeleverde, via zoeken gecontroleerde voorbeelden. Noem geen statistieken, namen of jaartallen die daar niet in staan.`
    : `- Voorbeelden uit de echte wereld: alleen algemeen bekende, controleerbare situaties. Verzin GEEN statistieken, namen, citaten of jaartallen; blijf liever algemeen ("veel supermarkten", "een gemiddeld mkb-bedrijf").`
}
- De eerste en laatste pagina kunnen stukjes van naburige paragrafen bevatten; laat die weg.
- Titels per hoofdstuk zijn intern en worden niet voorgelezen.`;
}

export function scriptPrompt(p: { code: string; title: string; startPage: number; endPage: number; text: string; examples?: string | null }) {
  return `Paragraaf ${p.code}: ${p.title} (reader-pagina ${p.startPage}-${p.endPage})

${p.text}${
    p.examples
      ? `

---
Gecontroleerde voorbeelden uit de echte wereld (via zoeken gevonden; gebruik wat past, alleen als illustratie):
${p.examples}`
      : ""
  }`;
}

/** Prompt for the optional grounding step (provider web search), returns plain text. */
export function examplesPrompt(p: { code: string; title: string; text: string; language: string }) {
  return `Hieronder staat een paragraaf uit een hbo-reader. Zoek op het web 4 tot 6 concrete, actuele en controleerbare voorbeelden uit de echte wereld (bij voorkeur Nederland of Europa, hbo-werkveld) die de kernideeën van deze paragraaf illustreren.
Geef per voorbeeld 2-3 zinnen in de taal met code ${p.language}: wat er gebeurde, welk kernidee het illustreert, en de bron (organisatie of website). Alleen feiten die je in de zoekresultaten hebt gevonden.

Paragraaf ${p.code}: ${p.title}

${p.text.slice(0, 20000)}`;
}

/** Default voice direction per language (OpenAI `instructions`, Gemini style prompt). */
export function defaultVoiceInstructions(language: string) {
  return language === "en"
    ? "Warm, enthusiastic lecturer; calm pace, clear articulation, friendly and engaging."
    : "Warme, enthousiaste Nederlandse docent; rustig tempo, duidelijke articulatie, vriendelijk en betrokken.";
}

/** Fixed script for the non-production stub (AI_STUB=1). */
export function stubScript(language: string): ScriptChapter[] {
  const en = language === "en";
  return [
    { kind: "hook", title: "Hook", text: en ? "Imagine walking into a busy shop..." : "Stel je voor dat je een drukke winkel binnenloopt..." },
    { kind: "idea", title: "Idee 1", text: en ? "The first point." : "Het eerste punt." },
    { kind: "idea", title: "Idee 2", text: en ? "The second point." : "Het tweede punt." },
    { kind: "idea", title: "Idee 3", text: en ? "The third point." : "Het derde punt." },
    { kind: "recap", title: "Recap", text: en ? "In short." : "Kort samengevat." },
    { kind: "quiz", title: "Test jezelf", text: en ? "Question one?\n...\nAnswer one." : "Vraag één?\n...\nAntwoord één." },
  ];
}
