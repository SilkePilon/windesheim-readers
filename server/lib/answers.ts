import type { QuestionData } from "../db/schema";

type Question = { id: string; type: string; prompt: string; difficulty: number; data: QuestionData };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
export { shuffle };

/** What the client sees: no answers. Ordering items are shuffled. */
export function publicQuestion(q: Question) {
  const d = q.data;
  const base = { id: q.id, type: q.type, prompt: q.prompt, difficulty: q.difficulty };
  switch (d.type) {
    case "mc":
      return { ...base, options: d.options };
    case "order": {
      let items = shuffle(d.items);
      if (items.every((x, i) => x === d.items[i])) items = [...d.items].reverse();
      return { ...base, items };
    }
    default:
      return base;
  }
}

/** Correct answer in the same shape the client submits. */
export function correctAnswer(d: QuestionData) {
  switch (d.type) {
    case "mc":
      return d.answer;
    case "tf":
      return d.answer;
    case "fill":
      return d.answers[0];
    case "order":
      return d.items;
    case "open":
      return d.modelAnswer;
  }
}

export function checkAnswer(d: QuestionData, answer: unknown): boolean {
  switch (d.type) {
    case "mc":
      return answer === d.answer;
    case "tf":
      return answer === d.answer;
    case "fill": {
      if (typeof answer !== "string") return false;
      const a = normalize(answer);
      return d.answers.some((x) => {
        const n = normalize(x);
        return a === n || (n.length > 5 && levenshtein(a, n) <= 1);
      });
    }
    case "order":
      return Array.isArray(answer) && answer.length === d.items.length && answer.every((x, i) => x === d.items[i]);
    case "open":
      return false;
  }
}

export function explanationOf(d: QuestionData) {
  return "explanation" in d ? d.explanation : d.modelAnswer;
}
