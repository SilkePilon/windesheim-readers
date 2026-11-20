// Pure planning for the daily reader session (spec: "The daily session (server)").
// Shared between client and server; no I/O here, the server feeds it.
import { mulberry32, shuffle, type Rng } from "./rng";

export const SESSION = { cards: 20, questions: 9, perLesson: 3, pullForwardDays: 21, weightFloor: 0.15 } as const;

/** Seconds per item for the session estimate. */
const SECONDS = { card: 10, question: 30, open: 120 } as const;
/** The exam is "close" (2 explain questions) within this many days. */
const OPEN_EXTRA_DAYS = 7;

export type PlanCard = { id: string; lessonId: string; due: number; retrievabilityAtExam?: number; pullForward?: boolean };
export type PlanQuestion = { id: string; lessonId: string; seen: boolean; lastCorrect: boolean | null };
export type PlanLesson = { id: string; mastery: number; started: boolean };
export type SessionPlanInput = {
  now: number;
  examDate: number | null;
  seed: number;
  dueCards: PlanCard[]; // due <= now, any order
  pullForwardCards: PlanCard[]; // due > exam, with retrievabilityAtExam
  questions: PlanQuestion[]; // quiz types only, ready lessons only
  openQuestions: PlanQuestion[];
  lessons: PlanLesson[];
  openAllowed: boolean; // grade quota left
};
export type PlanItem = { kind: "card"; id: string } | { kind: "question"; id: string } | { kind: "open"; id: string };
export type SessionPlan = {
  items: PlanItem[];
  needsStart: boolean;
  counts: { cards: number; questions: number; open: number };
  minutes: number;
};

const AMS_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Europe/Amsterdam calendar day of `ms`, as a UTC midnight timestamp. */
function amsterdamDay(ms: number): number {
  const parts = AMS_DATE.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"));
}

/** `YYYY-MM-DD` of `ms` in Europe/Amsterdam (the admin date input's value for an exam date). */
export function examDateYmd(ms: number): string {
  const parts = AMS_DATE.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The exam date as stored: ms at 00:00 Europe/Amsterdam on `ymd` (`YYYY-MM-DD`), NaN when
 * malformed. Amsterdam is UTC+1 or UTC+2 and never changes clocks at midnight, so one of
 * those two instants is the local midnight.
 */
export function examDateMs(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return NaN;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(utc) || new Date(utc).toISOString().slice(0, 10) !== ymd) return NaN;
  for (const hours of [1, 2]) {
    const ms = utc - hours * 3_600_000;
    if (examDateYmd(ms) === ymd && examDateYmd(ms - 1) !== ymd) return ms;
  }
  return NaN;
}

/** Whole calendar days until the exam in Europe/Amsterdam: 0 on exam day, negative after, null without a date. */
export function daysToExam(now: number, examDate: number | null): number | null {
  if (examDate == null) return null;
  return Math.round((amsterdamDay(examDate) - amsterdamDay(now)) / 86_400_000);
}

/** Session length in minutes (cards 10 s, questions 30 s, open 120 s), rounded; at least 1 when anything is planned. */
export function estimateMinutes(c: { cards: number; questions: number; open: number }): number {
  if (c.cards + c.questions + c.open <= 0) return 0;
  const seconds = c.cards * SECONDS.card + c.questions * SECONDS.question + c.open * SECONDS.open;
  return Math.max(1, Math.round(seconds / 60));
}

/** Quiz mastery evidence from a session: null below 2 questions, else fraction × min(1, n/5). */
export function sessionMastery(correct: number, n: number): number | null {
  if (n < 2) return null;
  return (correct / n) * Math.min(1, n / 5);
}

/** The lesson with the most questions in the session; ties go to the lowest mastery. */
export function mainLessonId(perLesson: { lessonId: string; total: number; mastery: number }[]): string | null {
  let best: (typeof perLesson)[number] | null = null;
  for (const l of perLesson) {
    if (!best || l.total > best.total || (l.total === best.total && l.mastery < best.mastery)) best = l;
  }
  return best?.lessonId ?? null;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const lessonWeight = (mastery: number) => 1 - clamp01(mastery) + SESSION.weightFloor;
/** Unseen, or last answered wrong. */
const preferred = (q: PlanQuestion) => !q.seen || q.lastCorrect === false;

/** Random order within a lesson, preferred questions first. */
function orderQuestions(rng: Rng, qs: PlanQuestion[]): PlanQuestion[] {
  const mixed = shuffle(rng, qs);
  return [...mixed.filter(preferred), ...mixed.filter((q) => !preferred(q))];
}

function pickCards(input: SessionPlanInput, days: number | null): PlanCard[] {
  const byDue = (a: PlanCard, b: PlanCard) => a.due - b.due || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const out = [...input.dueCards].sort(byDue).slice(0, SESSION.cards);
  if (days == null || days < 0 || days > SESSION.pullForwardDays || out.length >= SESSION.cards) return out;
  const taken = new Set(out.map((c) => c.id));
  const pool = input.pullForwardCards
    .filter((c) => !taken.has(c.id))
    .sort((a, b) => (a.retrievabilityAtExam ?? 1) - (b.retrievabilityAtExam ?? 1) || byDue(a, b));
  return [...out, ...pool.slice(0, SESSION.cards - out.length)];
}

/** Weighted draw without replacement per slot; a lesson drops out at 3 questions or when it runs dry. */
function pickQuestions(rng: Rng, started: PlanLesson[], questions: PlanQuestion[]): PlanQuestion[] {
  const pools = new Map<string, PlanQuestion[]>();
  for (const l of started) pools.set(l.id, []);
  for (const q of questions) pools.get(q.lessonId)?.push(q);
  const state = started
    .filter((l) => (pools.get(l.id)?.length ?? 0) > 0)
    .map((l) => ({ weight: lessonWeight(l.mastery), queue: orderQuestions(rng, pools.get(l.id)!), taken: 0 }));

  const out: PlanQuestion[] = [];
  while (out.length < SESSION.questions) {
    const open = state.filter((s) => s.taken < SESSION.perLesson && s.taken < s.queue.length);
    if (open.length === 0) break;
    const total = open.reduce((sum, s) => sum + s.weight, 0);
    let r = rng() * total;
    let pick = open[open.length - 1];
    for (const s of open) {
      r -= s.weight;
      if (r < 0) {
        pick = s;
        break;
      }
    }
    out.push(pick.queue[pick.taken++]);
  }
  return out;
}

/** One explain question from each of the weakest started lessons that have one. */
function pickOpen(rng: Rng, started: PlanLesson[], openQuestions: PlanQuestion[], count: number): PlanQuestion[] {
  const weakest = [...started].sort((a, b) => clamp01(a.mastery) - clamp01(b.mastery) || (a.id < b.id ? -1 : 1));
  const out: PlanQuestion[] = [];
  for (const l of weakest) {
    if (out.length >= count) break;
    const mine = openQuestions.filter((q) => q.lessonId === l.id);
    if (mine.length > 0) out.push(orderQuestions(rng, mine)[0]);
  }
  return out;
}

/** Cards in runs of 3–5 with a question after each run; leftover questions at the end; open item(s) at ~2/3 and end − 1. */
function interleave(rng: Rng, cards: PlanCard[], questions: PlanQuestion[], open: PlanQuestion[]): PlanItem[] {
  const items: PlanItem[] = [];
  let c = 0;
  let q = 0;
  while (c < cards.length || q < questions.length) {
    if (c < cards.length) {
      const run = 3 + Math.floor(rng() * 3);
      for (const card of cards.slice(c, c + run)) items.push({ kind: "card", id: card.id });
      c += run;
    }
    if (q < questions.length) items.push({ kind: "question", id: questions[q++].id });
  }
  if (open.length > 0) {
    const first = Math.round(0.66 * items.length);
    items.splice(first, 0, { kind: "open", id: open[0].id });
    for (const extra of open.slice(1)) {
      items.splice(Math.max(first + 1, items.length - 1), 0, { kind: "open", id: extra.id });
    }
  }
  return items;
}

const EMPTY = { cards: 0, questions: 0, open: 0 };

/** Today's mixed session: due (and pulled-forward) cards, weighted quiz questions and explain question(s), interleaved. */
export function buildSessionPlan(input: SessionPlanInput): SessionPlan {
  const started = input.lessons.filter((l) => l.started);
  if (started.length === 0) return { items: [], needsStart: true, counts: { ...EMPTY }, minutes: 0 };

  const rng = mulberry32(input.seed);
  const days = daysToExam(input.now, input.examDate);
  const cards = pickCards(input, days);
  const questions = pickQuestions(rng, started, input.questions);
  const openCount = !input.openAllowed ? 0 : days != null && days >= 0 && days <= OPEN_EXTRA_DAYS ? 2 : 1;
  const open = pickOpen(rng, started, input.openQuestions, openCount);
  const items = interleave(rng, cards, questions, open);
  const counts = { cards: cards.length, questions: questions.length, open: open.length };
  return { items, needsStart: false, counts, minutes: estimateMinutes(counts) };
}
