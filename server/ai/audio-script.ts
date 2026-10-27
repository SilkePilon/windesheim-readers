// Pure helpers for the "luisterles" (spoken lesson summary): script schema, prompt rules,
// normalisation and TTS input chunking. No DB or network access (unit-tested).
import { z } from "zod";
import { readerWording } from "./content-rules";

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
  /** Quality notes from generation (e.g. shorter than the word target); admin QC only. */
  warnings?: string[];
  /**
   * The lesson state the script was written for, and whether it has been spoken into a complete
   * audio set yet. An unspoken script for the same lesson state is reused on retry (no second
   * script call after a TTS failure).
   */
  source?: { generatedAt: number | null; startPage: number; endPage: number; language: string };
  spoken?: boolean;
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
    .describe("In deze volgorde: 1 hook, 1 roadmap, 2-5 idea, 1 recap, 1 quiz"),
});

export type RawScript = z.infer<typeof scriptSchema>;

/** The model wrote a script that doesn't have the required shape (worth one retry). */
export class ScriptValidationError extends Error {}

export const MIN_IDEAS = 3;
/** A short paragraph (1-2 reader pages) may carry only two core ideas. */
export const MIN_IDEAS_SHORT = 2;
export const MAX_IDEAS = 5;

/** Fewest core ideas a lesson of these pages needs. */
export function minIdeasFor(startPage: number, endPage: number) {
  return endPage - startPage + 1 <= 2 ? MIN_IDEAS_SHORT : MIN_IDEAS;
}

/** Spoken words a full script should at least reach (the prompt asks for ~800-1000). */
export function minScriptWords(ideas: number) {
  return ideas >= MIN_IDEAS ? 650 : 500;
}

/** Marker (own line) after each "Test jezelf" question: the TTS step inserts ~3 s of silence there. */
export const PAUSE_MARK = "[PAUZE]";
/** Silence inserted at each pause marker. */
export const PAUSE_MS = 3000;
const PAUSE_RE = /\[\s*(?:PAUZE|PAUSE)\s*\]/gi;
const HAS_PAUSE = /\[\s*(?:PAUZE|PAUSE)\s*\]/i;

/**
 * Validate and tidy a model-written script: trims, drops empty chapters, applies the reader
 * wording rule, merges repeated roadmap/recap/hook and folds ideas beyond 5 into the fifth.
 * Pause markers survive only in the quiz. Throws when the script is unusable (no hook/recap/quiz
 * or fewer than `minIdeas` ideas).
 */
export function normalizeScript(raw: RawScript, language: string, opts: { minIdeas?: number } = {}): ScriptChapter[] {
  const minIdeas = opts.minIdeas ?? MIN_IDEAS;
  const chapters = raw.chapters
    .map((c) => ({ kind: c.kind, title: c.title.trim() || c.kind, text: readerWording(tidySpoken(c.text, c.kind === "quiz"), language) }))
    .map((c) => (c.kind === "quiz" ? { ...c, text: ensureQuizPauses(c.text) } : c))
    .filter((c) => c.text.replace(PAUSE_RE, "").trim().length > 0);
  const one = (kind: ChapterKind) => {
    const list = chapters.filter((c) => c.kind === kind);
    if (!list.length) return null;
    return { ...list[0]!, text: list.map((c) => c.text).join("\n\n") };
  };
  const hook = one("hook");
  const roadmap = one("roadmap");
  const recap = one("recap");
  const quiz = one("quiz");
  const all = chapters.filter((c) => c.kind === "idea");
  // Never silently drop content: extra ideas ride along with the last allowed one.
  const ideas = all.slice(0, MAX_IDEAS);
  if (all.length > MAX_IDEAS) ideas[MAX_IDEAS - 1] = { ...ideas[MAX_IDEAS - 1]!, text: all.slice(MAX_IDEAS - 1).map((c) => c.text).join("\n\n") };
  if (!hook) throw new ScriptValidationError("Script has no hook");
  if (ideas.length < minIdeas) throw new ScriptValidationError(`Script has ${ideas.length} core ideas (need ${minIdeas}-${MAX_IDEAS})`);
  if (!recap) throw new ScriptValidationError("Script has no recap");
  if (!quiz) throw new ScriptValidationError("Script has no self-test questions");
  // A one-sentence roadmap is too short for its own chapter: it rides along with the hook.
  const opening = roadmap ? { ...hook, text: `${hook.text}\n\n${roadmap.text}` } : hook;
  return [opening, ...ideas, recap, quiz];
}

/** A stored (already normalised) script is still usable as-is: hook, ideas, recap, quiz, all non-empty. */
export function isUsableScript(chapters: unknown, minIdeas = MIN_IDEAS): chapters is ScriptChapter[] {
  if (!Array.isArray(chapters) || chapters.length < minIdeas + 3) return false;
  if (!chapters.every((c) => c && CHAPTER_KINDS.includes(c.kind) && typeof c.text === "string" && c.text.trim() && typeof c.title === "string")) return false;
  const kinds = chapters.map((c: ScriptChapter) => c.kind);
  const ideas = kinds.slice(1, -2);
  return kinds[0] === "hook" && kinds.at(-2) === "recap" && kinds.at(-1) === "quiz" && ideas.length <= MAX_IDEAS && ideas.every((k) => k === "idea");
}

/** The model forgot the pause markers: put one between each question and its "Het antwoord:". */
function ensureQuizPauses(text: string) {
  if (HAS_PAUSE.test(text)) return text;
  return text.replace(/\?[ \t]*\n?[ \t]*(?=(?:Het antwoord|The answer)\b)/gi, `?\n${PAUSE_MARK}\n`);
}

/** Split spoken text at pause markers (the TTS step joins the parts with silence). */
export function splitPauses(text: string): string[] {
  return text
    .split(PAUSE_RE)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Strip what the TTS would read out loud or stumble over: Markdown, bullets, URLs, page markers
 * and pause markers (kept, on their own line, only with `keepPauses` for the quiz).
 */
export function tidySpoken(s: string, keepPauses = false) {
  return s
    // URLs (never spoken), keeping sentence punctuation and closing brackets after them.
    .replace(/\b(?:https?:\/\/|www\.)[^\s)\]}>"']*[^\s)\]}>"'.,;:!?]/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(PAUSE_RE, keepPauses ? `\n${PAUSE_MARK}\n` : " ")
    .replace(/\*\*|__|`|#+\s/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+\[PAUZE\]\n+/g, `\n${PAUSE_MARK}\n`)
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

/** Spoken-word targets per chapter (checked loosely: only the total is enforced, see `minScriptWords`). */
export const WORD_TARGETS = { hook: [60, 90], roadmap: [25, 25], idea: [130, 200], recap: [70, 90], quiz: [90, 130] } as const;

/** System prompt for the spoken script (one narrator, ~5-7 minutes). A real variant per language. */
export function scriptInstructions(language: string, grounded: boolean) {
  return language === "en" ? scriptInstructionsEn(grounded) : scriptInstructionsNl(grounded);
}

function scriptInstructionsNl(grounded: boolean) {
  const t = WORD_TARGETS;
  return `Je bent een ervaren, enthousiaste hbo-docent die een luisterles maakt: een gesproken samenvatting van één paragraaf uit de reader, voorgelezen door één verteller (tekst-naar-spraak). Studenten zien de tekst nooit; ze horen alleen audio. Schrijf alles in het Nederlands.

Opbouw (in totaal 800 tot 1000 gesproken woorden, vijf tot zeven minuten). Elk hoofdstuk is een los audiobestand in de speler, in deze volgorde:
1. hook (${t.hook[0]}-${t.hook[1]} woorden): ${grounded ? "een herkenbare situatie, een prikkelende vraag of een voorbeeld uit de aangeleverde, gecontroleerde voorbeelden" : "een herkenbare situatie uit het dagelijks leven of het werkveld, of een prikkelende vraag. Geen getallen, geen statistiek en geen \"verrassend feit\""}, en waarom deze paragraaf nuttig is. Noem hier één keer de paragraaf, uitgesproken zoals je het zegt (bijvoorbeeld "paragraaf één punt twee" voor 1.2) met de titel.
2. roadmap (ongeveer ${t.roadmap[0]} woorden, één zin): wat er komt, met signaalwoorden ("drie dingen").
3. idea (het aantal kernideeën dat in de opdracht staat, nooit meer dan vijf; elk ${t.idea[0]}-${t.idea[1]} woorden): één kernidee per hoofdstuk: het idee, een herkenbaar voorbeeld uit de praktijk dat past bij de opleiding en het werkveld van de student, en waarom het ertoe doet. Begin met een signaalwoord ("Het tweede punt...") en een korte brug naar het vorige idee. Past er meer in de paragraaf, voeg verwante punten dan samen.
4. recap (${t.recap[0]}-${t.recap[1]} woorden): de kernideeën, elk in één adem.
5. quiz (${t.quiz[0]}-${t.quiz[1]} woorden): begin hardop met "Test jezelf". Stel dan twee of drie open vragen die je in je hoofd beantwoordt, elk over een ander kernidee. Nooit een ja/nee-vraag; vraag naar het waarom, het hoe of een voorbeeld. Zet na elke vraag een nieuwe regel met alleen ${PAUSE_MARK} (daar komt een stilte van drie seconden), en begin het antwoord daarna met "Het antwoord:" gevolgd door één of twee zinnen.

De hoofdstukken zijn losse bestanden: geen begroeting, geen "welkom (terug)" en geen afscheid per hoofdstuk. Het hele verhaal loopt door.

Stijl (geschreven voor het oor):
- Persoonlijk en conversationeel: spreek de student aan met "je" en gebruik "we". Korte zinnen, spreektaal, afwisselend ritme.
- Geen opsommingstekens, tabellen, kopjes, Markdown of emoji. Nooit "zie figuur" of "in de tabel".
- Uitspraak: schrijf alles uit zoals je het zegt. Symbolen voluit ("procent", "euro", "en"), getallen afgerond en in woorden ("ruim twintig procent", "bijna een miljoen"); jaartallen mogen als cijfers (2019). Geen haakjes, geen schuine strepen en geen afkortingen als "bv.", "d.w.z." of "o.a."; zeg "bijvoorbeeld". Een gangbare afkorting of Engelse vakterm leg je de eerste keer kort uit.
- Lees nooit paginanummers of markeringen als [[PAGINA 3]] voor, en zeg nooit een webadres. Een bron noem je hooguit kort ("volgens het CBS").
- Korte pauzes: een nieuwe regel. Geen regieaanwijzingen tussen haakjes. ${PAUSE_MARK} gebruik je alleen in de quiz.

Inhoud:
- De kerninhoud komt UITSLUITEND uit de tekst van de paragraaf. Verzin geen feiten over de stof.
- Studenten zien alleen de reader, nooit jouw invoer. Verwijs naar de bron als "de reader", nooit als "de tekst" of "het fragment". Noem "de reader" hooguit een of twee keer in de hele luisterles.
${
  grounded
    ? `- Voorbeelden uit de echte wereld: gebruik bij voorkeur de aangeleverde, via zoeken gecontroleerde voorbeelden. Noem geen statistieken, namen of jaartallen die daar niet in staan.`
    : `- Voorbeelden uit de echte wereld: alleen algemeen bekende, herkenbare situaties. Verzin GEEN statistieken, namen, citaten of jaartallen; blijf liever algemeen ("veel supermarkten", "een gemiddeld mkb-bedrijf").`
}
- Voorbeelden passen bij de Nederlandse context en bij de opleiding en het vak uit de opdracht.
- De eerste en laatste pagina kunnen stukjes van naburige paragrafen bevatten; laat die weg.
- Titels per hoofdstuk zijn intern en worden niet voorgelezen.`;
}

function scriptInstructionsEn(grounded: boolean) {
  const t = WORD_TARGETS;
  return `You are an experienced, enthusiastic university of applied sciences lecturer making a listening lesson: a spoken summary of one paragraph of the course reader, read aloud by a single narrator (text-to-speech). Students never see the text; they only hear the audio. Write everything in English.

Structure (800 to 1,000 spoken words in total, five to seven minutes). Each chapter is a separate audio file in the player, in this order:
1. hook (${t.hook[0]}-${t.hook[1]} words): ${grounded ? "a recognisable situation, a thought-provoking question or one of the verified examples provided" : "a recognisable situation from daily life or professional practice, or a thought-provoking question. No numbers, no statistics and no \"surprising fact\""}, and why this paragraph is useful. Name the paragraph here once, the way you would say it (for example "section one point two" for 1.2), with its title.
2. roadmap (about ${t.roadmap[0]} words, one sentence): what is coming, with signposts ("three things").
3. idea (the number of core ideas given in the task, never more than five; each ${t.idea[0]}-${t.idea[1]} words): one core idea per chapter: the idea, a recognisable example from practice that fits the student's programme and field, and why it matters. Start with a signpost ("The second point...") and a short bridge from the previous idea. If the paragraph holds more, merge related points.
4. recap (${t.recap[0]}-${t.recap[1]} words): the core ideas, one breath each.
5. quiz (${t.quiz[0]}-${t.quiz[1]} words): start by saying "Test yourself" out loud. Then ask two or three open questions to answer in your head, each about a different core idea. Never a yes/no question; ask why, how, or for an example. After each question put a new line containing only ${PAUSE_MARK} (a three-second silence goes there), then start the answer with "The answer:" followed by one or two sentences.

The chapters are separate files: no greeting, no "welcome back" and no goodbye per chapter. The story runs on.

Style (written for the ear):
- Personal and conversational: address the student as "you" and use "we". Short sentences, spoken language, varied rhythm.
- No bullet points, tables, headings, Markdown or emoji. Never "see figure" or "in the table".
- Pronunciation: write everything the way you say it. Symbols in words ("percent", "euros", "and"), numbers rounded and in words ("just over twenty percent", "almost a million"); years may stay as digits (2019). No parentheses, no slashes and no abbreviations such as "e.g.", "i.e." or "etc."; say "for example". Explain a common abbreviation or jargon term briefly the first time.
- Never read out page numbers or markers like [[PAGINA 3]], and never say a web address. Mention a source briefly at most ("according to Eurostat").
- Short pauses: a new line. No stage directions in brackets. Use ${PAUSE_MARK} only in the quiz.

Content:
- The core content comes ONLY from the paragraph's text. Do not invent facts about the subject.
- Students only see the reader, never your input. Refer to the source as "the reader", never "the text" or "the passage". Say "the reader" at most once or twice in the whole lesson.
${
  grounded
    ? `- Real-world examples: prefer the verified examples provided (found through search). Do not mention statistics, names or years that are not in them.`
    : `- Real-world examples: only well-known, recognisable situations. Do NOT invent statistics, names, quotes or years; rather stay general ("many supermarkets", "a typical small business").`
}
- Examples fit a local, European context (the students study in the Netherlands) and the programme and course from the task.
- The first and last page may contain bits of neighbouring paragraphs; leave those out.
- Chapter titles are internal and are not read out.`;
}

export interface ScriptPromptInput {
  code: string;
  title: string;
  text: string;
  examples?: string | null;
  language?: string;
  /** Reader (course material) title and course, so the examples fit the student's field. */
  readerTitle?: string | null;
  course?: string | null;
  minIdeas?: number;
  /** Feedback for a second attempt (validation error or too short). */
  retryNote?: string | null;
}

export function scriptPrompt(p: ScriptPromptInput) {
  const en = p.language === "en";
  const min = p.minIdeas ?? MIN_IDEAS;
  const ctx = [p.readerTitle && `Reader: ${p.readerTitle}`, p.course && (en ? `Course: ${p.course}` : `Vak/opleiding: ${p.course}`)].filter(Boolean).join("\n");
  const task = en
    ? `Paragraph ${p.code}: ${p.title}\nNumber of core ideas: ${min} to ${MAX_IDEAS}.`
    : `Paragraaf ${p.code}: ${p.title}\nAantal kernideeën: ${min} tot ${MAX_IDEAS}.`;
  const examples = p.examples
    ? `\n\n---\n${en ? "Verified real-world examples (found through search; use what fits, as illustration only)" : "Gecontroleerde voorbeelden uit de echte wereld (via zoeken gevonden; gebruik wat past, alleen als illustratie)"}:\n${p.examples}`
    : "";
  const retry = p.retryNote ? `\n\n---\n${en ? "Your previous attempt was rejected" : "Je vorige poging is afgekeurd"}: ${p.retryNote}` : "";
  return `${ctx ? `${ctx}\n` : ""}${task}\n\n${p.text}${examples}${retry}`;
}

/** Prompt for the optional grounding step (provider web search), returns plain text. */
export function examplesPrompt(p: { code: string; title: string; text: string; language: string; readerTitle?: string | null; course?: string | null }) {
  const ctx = [p.readerTitle, p.course].filter(Boolean).join(", ");
  if (p.language === "en")
    return `Below is a paragraph from a course reader at a Dutch university of applied sciences${ctx ? ` (${ctx})` : ""}. Use web search to find exactly one concrete, recent and verifiable real-world example per core idea of this paragraph (preferably from the Netherlands or Europe, relevant to the student's field).
For each example write 2-3 sentences in English: what happened and when (year or date), which core idea it illustrates, and the source (organisation name, no web address). Only use facts you actually found in the search results; skip a core idea rather than guess.

Paragraph ${p.code}: ${p.title}

${p.text.slice(0, 20000)}`;
  return `Hieronder staat een paragraaf uit een hbo-reader${ctx ? ` (${ctx})` : ""}. Zoek op het web per kernidee van deze paragraaf precies één concreet, actueel en controleerbaar voorbeeld uit de echte wereld (bij voorkeur Nederland of Europa, passend bij het werkveld van de student).
Geef per voorbeeld 2-3 zinnen in het Nederlands: wat er gebeurde en wanneer (jaartal of datum), welk kernidee het illustreert, en de bron (naam van de organisatie, geen webadres). Gebruik alleen feiten die je echt in de zoekresultaten hebt gevonden; sla een kernidee liever over dan te gokken.

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
    {
      kind: "quiz",
      title: "Test jezelf",
      text: en ? `Test yourself. Question one?\n${PAUSE_MARK}\nThe answer: answer one.` : `Test jezelf. Vraag één?\n${PAUSE_MARK}\nHet antwoord: antwoord één.`,
    },
  ];
}

