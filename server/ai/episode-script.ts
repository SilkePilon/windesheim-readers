// Pure helpers for the weekly audio episode ("aflevering"): one spoken story per reader week,
// built from that week's lessons. Same tone and TTS rules as the luisterles (audio-script.ts).
// No DB or network access.
import { z } from "zod";
import { PAUSE_MARK, spokenRules, tidySpoken, wordCount } from "./audio-script";
import { readerWording } from "./content-rules";

export const EPISODE_CHAPTER_KINDS = ["hook", "lesson", "connect", "selftest", "recap"] as const;
export type EpisodeChapterKind = (typeof EPISODE_CHAPTER_KINDS)[number];

export interface EpisodeChapter {
  kind: EpisodeChapterKind;
  /** Internal; never read out. */
  title: string;
  /** TTS-ready spoken text. */
  text: string;
}

/** The lessons an episode was made from (stored as `readerEpisode.sourceSnapshot`). */
export type EpisodeSource = { lessonId: string; generatedAt: number | null; startPage: number; endPage: number }[];

export interface EpisodeScript {
  /** Student-facing episode title. */
  title: string;
  chapters: EpisodeChapter[];
  /** The week state the script was written for, and whether it was spoken into a complete set (reuse after a TTS failure). */
  source?: EpisodeSource;
  spoken?: boolean;
}

export const episodeScriptSchema = z.object({
  title: z.string().describe("Korte, pakkende titel van de aflevering (max. 60 tekens)"),
  chapters: z
    .array(
      z.object({
        kind: z.enum(EPISODE_CHAPTER_KINDS).describe("hook | lesson | connect | selftest | recap"),
        title: z.string().describe("Korte interne titel van dit deel (wordt niet voorgelezen)"),
        text: z.string().describe("De uitgesproken tekst van dit deel, klaar voor tekst-naar-spraak"),
      }),
    )
    .describe("In deze volgorde: 1 hook, 1 lesson per paragraaf (in de gegeven volgorde), 1 connect, 1 selftest, 1 recap"),
});
export type RawEpisodeScript = z.infer<typeof episodeScriptSchema>;

/** The model wrote an episode that doesn't have the required shape (worth one retry). */
export class EpisodeValidationError extends Error {}

/** Total spoken words of an episode (about fifteen minutes). */
export const EPISODE_WORDS = [2000, 2300] as const;
/** Fewest spoken words before the script gets a "too short" retry. */
export const MIN_EPISODE_WORDS = 1600;
/** Max characters of lesson material in the prompt. */
export const EPISODE_SOURCE_CHARS = 24_000;

/** Spoken-word targets per chapter for a week of `lessons` lessons (the lesson chapters share what is left). */
export function episodeWordTargets(lessons: number) {
  const fixed = { hook: [120, 160], connect: [200, 260], selftest: [200, 250], recap: [140, 180] } as const;
  const n = Math.max(1, lessons);
  // Each lesson chapter gets an equal share of what the fixed chapters leave (rounded down to 10
  // words, at least LESSON_WORDS_FLOOR), so the targets add up to at most EPISODE_WORDS[1].
  const per = (i: 0 | 1) => {
    const rest = EPISODE_WORDS[i] - fixed.hook[i] - fixed.connect[i] - fixed.selftest[i] - fixed.recap[i];
    return Math.max(LESSON_WORDS_FLOOR, Math.floor(rest / n / 10) * 10);
  };
  return { ...fixed, lesson: [per(0), per(1)] as const };
}

/** Fewest words a lesson chapter is asked for, however many lessons the week has. */
export const LESSON_WORDS_FLOOR = 80;

export interface EpisodeLessonInput {
  code: string;
  title: string;
  summary: string | null;
  keyPoints: string[] | null;
  terms: { term: string; definition: string }[];
  text: string;
}

/**
 * Lesson material for the prompt, trimmed to `max` characters: summaries, key points and terms
 * always go in; the page text of each lesson gets an equal share of what is left.
 */
export function episodeMaterial(lessons: EpisodeLessonInput[], language: string, max = EPISODE_SOURCE_CHARS) {
  const en = language === "en";
  const head = (l: EpisodeLessonInput) =>
    [
      `### ${en ? "Paragraph" : "Paragraaf"} ${l.code}: ${l.title}`,
      l.summary && `${en ? "Summary" : "Samenvatting"}:\n${l.summary}`,
      l.keyPoints?.length && `${en ? "Key points" : "Kernpunten"}:\n${l.keyPoints.map((p) => `- ${p}`).join("\n")}`,
      l.terms.length && `${en ? "Terms" : "Begrippen"}:\n${l.terms.map((t) => `- ${t.term}: ${t.definition}`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  const heads = lessons.map(head);
  const label = en ? "Text from the reader" : "Tekst uit de reader";
  const share = Math.max(0, Math.floor((max - heads.reduce((a, h) => a + h.length + 4, 0)) / Math.max(1, lessons.length)) - label.length - 4);
  const parts = lessons.map((l, i) => {
    const text = l.text.trim().slice(0, share);
    return text ? `${heads[i]}\n\n${label}:\n${text}` : heads[i]!;
  });
  return parts.join("\n\n---\n\n").slice(0, max);
}

/** System prompt for the episode script. A real variant per language. */
export function episodeInstructions(language: string, lessons: number) {
  const t = episodeWordTargets(lessons);
  if (language === "en")
    return `You are an experienced, enthusiastic university of applied sciences lecturer making a weekly audio episode: a spoken story that ties together this week's paragraphs of the course reader, read aloud by a single narrator (text-to-speech). Students never see the text; they only hear the audio. Write everything in English.

Structure (${EPISODE_WORDS[0]} to ${EPISODE_WORDS[1]} spoken words in total, about fifteen minutes). Each chapter is a separate audio file in the player, in this order:
1. hook (${t.hook[0]}-${t.hook[1]} words): a recognisable situation from daily life or professional practice, or a thought-provoking question. No numbers, no statistics and no "surprising fact". Then why this week matters.
2. lesson (exactly one per paragraph, in the order given; each ${t.lesson[0]}-${t.lesson[1]} words): tell the paragraph as a story with concrete examples from the student's field. Do not read out a list. Start with a short bridge from the previous chapter and name the paragraph once, the way you would say it (for example "section one point two" for 1.2), with its title.
3. connect (${t.connect[0]}-${t.connect[1]} words): how this week's paragraphs connect to each other, and to what came before in the course where that is clear from the material.
4. selftest (${t.selftest[0]}-${t.selftest[1]} words): start by saying "Test yourself" out loud. Ask exactly three open questions, each about a different paragraph if possible. Never a yes/no question. After each question put a new line containing only ${PAUSE_MARK} (a three-second silence goes there), then start the answer with "The answer:" followed by one or two sentences.
5. recap (${t.recap[0]}-${t.recap[1]} words): the main ideas of the week, one breath each, and one sentence to close.

The chapters are separate files: no greeting or goodbye per chapter. The story runs on.

${spokenRules("en", false, "episode")}
- The episode title is short and student-facing.`;
  return `Je bent een ervaren, enthousiaste hbo-docent die een wekelijkse aflevering maakt: een gesproken verhaal dat de paragrafen van deze week uit de reader met elkaar verbindt, voorgelezen door één verteller (tekst-naar-spraak). Studenten zien de tekst nooit; ze horen alleen audio. Schrijf alles in het Nederlands.

Opbouw (in totaal ${EPISODE_WORDS[0]} tot ${EPISODE_WORDS[1]} gesproken woorden, ongeveer een kwartier). Elk hoofdstuk is een los audiobestand in de speler, in deze volgorde:
1. hook (${t.hook[0]}-${t.hook[1]} woorden): een herkenbare situatie uit het dagelijks leven of het werkveld, of een prikkelende vraag. Geen getallen, geen statistiek en geen "verrassend feit". Daarna waarom deze week ertoe doet.
2. lesson (precies één per paragraaf, in de gegeven volgorde; elk ${t.lesson[0]}-${t.lesson[1]} woorden): vertel de paragraaf als een verhaal met concrete voorbeelden uit het werkveld van de student. Lees geen lijstje voor. Begin met een korte brug vanuit het vorige hoofdstuk en noem de paragraaf één keer, uitgesproken zoals je het zegt (bijvoorbeeld "paragraaf één punt twee" voor 1.2), met de titel.
3. connect (${t.connect[0]}-${t.connect[1]} woorden): hoe de paragrafen van deze week met elkaar samenhangen, en met wat eerder in het vak kwam als dat uit de stof blijkt.
4. selftest (${t.selftest[0]}-${t.selftest[1]} woorden): begin hardop met "Test jezelf". Stel precies drie open vragen, zo mogelijk elk over een andere paragraaf. Nooit een ja/nee-vraag. Zet na elke vraag een nieuwe regel met alleen ${PAUSE_MARK} (daar komt een stilte van drie seconden), en begin het antwoord daarna met "Het antwoord:" gevolgd door één of twee zinnen.
5. recap (${t.recap[0]}-${t.recap[1]} woorden): de hoofdlijnen van de week, elk in één adem, en één afsluitende zin.

De hoofdstukken zijn losse bestanden: geen begroeting of afscheid per hoofdstuk. Het verhaal loopt door.

${spokenRules("nl", false, "episode")}
- De titel van de aflevering is kort en voor studenten.`;
}

export function episodePrompt(p: {
  week: number;
  lessons: { code: string; title: string }[];
  material: string;
  language: string;
  readerTitle?: string | null;
  course?: string | null;
  retryNote?: string | null;
}) {
  const en = p.language === "en";
  const ctx = [p.readerTitle && `Reader: ${p.readerTitle}`, p.course && (en ? `Course: ${p.course}` : `Vak/opleiding: ${p.course}`)].filter(Boolean).join("\n");
  const list = p.lessons.map((l, i) => `${i + 1}. ${l.code}: ${l.title}`).join("\n");
  const task = en
    ? `Week ${p.week}. Paragraphs (one lesson chapter each, in this order):\n${list}`
    : `Week ${p.week}. Paragrafen (elk één lesson-hoofdstuk, in deze volgorde):\n${list}`;
  const retry = p.retryNote ? `\n\n---\n${en ? "Your previous attempt was rejected" : "Je vorige poging is afgekeurd"}: ${p.retryNote}` : "";
  return `${ctx ? `${ctx}\n` : ""}${task}\n\n---\n\n${p.material}${retry}`;
}

/**
 * Validate and tidy a model-written episode: trims, applies the reader wording rule, merges
 * repeated hook/connect/selftest/recap, folds extra lesson chapters into the last one and puts
 * everything in the fixed order. Throws when a part is missing or there are too few lesson chapters.
 */
export function normalizeEpisodeScript(raw: RawEpisodeScript, language: string, lessons: number): EpisodeScript {
  const chapters = raw.chapters
    .map((c) => ({ kind: c.kind, title: c.title.trim() || c.kind, text: readerWording(tidySpoken(c.text, c.kind === "selftest"), language) }))
    .filter((c) => c.text.replace(/\[\s*(?:PAUZE|PAUSE)\s*\]/gi, "").trim().length > 0);
  const one = (kind: EpisodeChapterKind) => {
    const list = chapters.filter((c) => c.kind === kind);
    return list.length ? { ...list[0]!, text: list.map((c) => c.text).join("\n\n") } : null;
  };
  const hook = one("hook");
  const connect = one("connect");
  const selftest = one("selftest");
  const recap = one("recap");
  const all = chapters.filter((c) => c.kind === "lesson");
  const lessonChapters = all.slice(0, lessons);
  if (all.length > lessons && lessons > 0)
    lessonChapters[lessons - 1] = { ...lessonChapters[lessons - 1]!, text: all.slice(lessons - 1).map((c) => c.text).join("\n\n") };
  if (!hook) throw new EpisodeValidationError("Episode has no hook");
  if (lessonChapters.length < lessons) throw new EpisodeValidationError(`Episode has ${lessonChapters.length} lesson chapters (need ${lessons})`);
  if (!connect) throw new EpisodeValidationError("Episode has no connect chapter");
  if (!selftest) throw new EpisodeValidationError("Episode has no self-test");
  if (!recap) throw new EpisodeValidationError("Episode has no recap");
  const title = readerWording(tidySpoken(raw.title), language).slice(0, 80) || (language === "en" ? "This week" : "Deze week");
  return { title, chapters: [hook, ...lessonChapters, connect, selftest, recap] };
}

export const episodeWordCount = (s: EpisodeScript) => wordCount(s.chapters);

/** Fixed episode for the non-production stub (AI_STUB=1). */
export function stubEpisodeScript(week: number, lessons: { code: string; title: string }[], language: string): EpisodeScript {
  const en = language === "en";
  return {
    title: en ? `Week ${week} in one story` : `Week ${week} in één verhaal`,
    chapters: [
      { kind: "hook", title: "Hook", text: en ? "Why this week matters." : "Waarom deze week ertoe doet." },
      ...lessons.map((l) => ({ kind: "lesson" as const, title: `${l.code} ${l.title}`, text: en ? `The story of ${l.code}.` : `Het verhaal van ${l.code}.` })),
      { kind: "connect", title: "Connect", text: en ? "How it all connects." : "Hoe het samenhangt." },
      {
        kind: "selftest",
        title: "Test jezelf",
        text: en ? `Test yourself. Question one?\n${PAUSE_MARK}\nThe answer: answer one.` : `Test jezelf. Vraag één?\n${PAUSE_MARK}\nHet antwoord: antwoord één.`,
      },
      { kind: "recap", title: "Recap", text: en ? "In short." : "Kort samengevat." },
    ],
  };
}
