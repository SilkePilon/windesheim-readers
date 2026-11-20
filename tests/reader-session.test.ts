import { describe, expect, test } from "bun:test";
import {
  buildSessionPlan,
  daysToExam,
  estimateMinutes,
  mainLessonId,
  SESSION,
  sessionMastery,
  type PlanCard,
  type PlanItem,
  type PlanLesson,
  type PlanQuestion,
  type SessionPlanInput,
} from "../shared/reader-session";
import { sessionXpFactor, XP } from "../shared/game";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 10, 0, 0);

function cards(n: number, lessonId = "L1", start = NOW - 1000 * DAY): PlanCard[] {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i}`, lessonId, due: start + i * 1000 }));
}

function questionsFor(lessonId: string, n: number, extra: Partial<PlanQuestion> = {}): PlanQuestion[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${lessonId}-q${i}`, lessonId, seen: false, lastCorrect: null, ...extra }));
}

function lesson(id: string, mastery = 0.5, started = true): PlanLesson {
  return { id, mastery, started };
}

function input(over: Partial<SessionPlanInput> = {}): SessionPlanInput {
  const lessons = over.lessons ?? [lesson("L1"), lesson("L2"), lesson("L3"), lesson("L4")];
  return {
    now: NOW,
    examDate: null,
    seed: 1,
    dueCards: [],
    pullForwardCards: [],
    questions: lessons.flatMap((l) => questionsFor(l.id, 6)),
    openQuestions: lessons.map((l) => ({ id: `${l.id}-open`, lessonId: l.id, seen: false, lastCorrect: null })),
    lessons,
    openAllowed: true,
    ...over,
  };
}

const ids = (items: PlanItem[], kind: PlanItem["kind"]) => items.filter((i) => i.kind === kind).map((i) => i.id);
const lessonOf = (q: string) => q.split("-")[0];

describe("cards", () => {
  test("200 due cards are capped at 20, oldest due first", () => {
    const due = cards(200).reverse();
    const plan = buildSessionPlan(input({ dueCards: due }));
    const got = ids(plan.items, "card");
    expect(got).toHaveLength(SESSION.cards);
    expect(got).toEqual(Array.from({ length: 20 }, (_, i) => `c${i}`));
    expect(plan.counts.cards).toBe(20);
  });

  const pull: PlanCard[] = [
    { id: "p1", lessonId: "L1", due: NOW + 40 * DAY, retrievabilityAtExam: 0.9, pullForward: true },
    { id: "p2", lessonId: "L1", due: NOW + 40 * DAY, retrievabilityAtExam: 0.3, pullForward: true },
    { id: "p3", lessonId: "L2", due: NOW + 40 * DAY, retrievabilityAtExam: 0.6, pullForward: true },
  ];

  test("exam 30 days out ignores pull-forward cards", () => {
    const plan = buildSessionPlan(input({ examDate: NOW + 30 * DAY, dueCards: cards(5), pullForwardCards: pull }));
    expect(ids(plan.items, "card")).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  test("exam 10 days out fills the remaining slots by retrievability at exam, lowest first", () => {
    const plan = buildSessionPlan(input({ examDate: NOW + 10 * DAY, dueCards: cards(5), pullForwardCards: pull }));
    expect(ids(plan.items, "card")).toEqual(["c0", "c1", "c2", "c3", "c4", "p2", "p3", "p1"]);
  });

  test("pull-forward never exceeds the card cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, lessonId: "L1", due: NOW + 40 * DAY, retrievabilityAtExam: i / 30 }));
    const plan = buildSessionPlan(input({ examDate: NOW + 10 * DAY, dueCards: cards(15), pullForwardCards: many }));
    expect(ids(plan.items, "card")).toHaveLength(20);
    expect(ids(plan.items, "card").slice(15)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  test("an exam in the past pulls nothing forward", () => {
    const plan = buildSessionPlan(input({ examDate: NOW - 2 * DAY, dueCards: cards(5), pullForwardCards: pull }));
    expect(ids(plan.items, "card")).toHaveLength(5);
  });
});

describe("questions", () => {
  test("no lesson gets more than 3, and the total is 9", () => {
    for (let seed = 0; seed < 100; seed++) {
      const plan = buildSessionPlan(input({ seed }));
      const qs = ids(plan.items, "question");
      expect(qs).toHaveLength(SESSION.questions);
      expect(new Set(qs).size).toBe(qs.length);
      const per = new Map<string, number>();
      for (const q of qs) per.set(lessonOf(q), (per.get(lessonOf(q)) ?? 0) + 1);
      for (const n of per.values()) expect(n).toBeLessThanOrEqual(SESSION.perLesson);
    }
  });

  test("fewer questions when the started lessons can't supply 9", () => {
    const lessons = [lesson("L1"), lesson("L2")];
    const plan = buildSessionPlan(input({ lessons, questions: lessons.flatMap((l) => questionsFor(l.id, 6)) }));
    expect(ids(plan.items, "question")).toHaveLength(6);
  });

  test("weak lessons get at least twice the questions of strong ones over 500 seeds", () => {
    const lessons = [
      lesson("Weak", 0.1),
      lesson("Strong", 0.9),
      ...Array.from({ length: 10 }, (_, i) => lesson(`F${i}`, 0.5)),
      lesson("Cold", 0, false),
    ];
    const questions = lessons.flatMap((l) => questionsFor(l.id, 5));
    const count: Record<string, number> = {};
    for (let seed = 0; seed < 500; seed++) {
      const plan = buildSessionPlan(input({ seed, lessons, questions }));
      for (const q of ids(plan.items, "question")) count[lessonOf(q)] = (count[lessonOf(q)] ?? 0) + 1;
    }
    expect(count.Weak).toBeGreaterThanOrEqual(2 * count.Strong);
    expect(count.Strong).toBeGreaterThan(0); // the weight floor keeps mastered lessons coming back
    expect(count.Cold).toBeUndefined();
  });

  test("unseen and wrongly answered questions are taken before correct ones", () => {
    const lessons = [lesson("A"), lesson("B"), lesson("C")];
    const questions = lessons.flatMap((l) => [
      ...questionsFor(l.id, 4, { seen: true, lastCorrect: true }).map((q) => ({ ...q, id: `${q.id}ok` })),
      { id: `${l.id}-new`, lessonId: l.id, seen: false, lastCorrect: null },
      { id: `${l.id}-wrong`, lessonId: l.id, seen: true, lastCorrect: false },
    ]);
    for (let seed = 0; seed < 50; seed++) {
      const qs = ids(buildSessionPlan(input({ seed, lessons, questions })).items, "question");
      for (const l of lessons) {
        const mine = qs.filter((q) => lessonOf(q) === l.id);
        expect(mine).toHaveLength(3);
        expect(mine).toContain(`${l.id}-new`);
        expect(mine).toContain(`${l.id}-wrong`);
      }
    }
  });
});

describe("order", () => {
  test("no more than 5 cards in a row while questions remain, open item between 50% and 80%", () => {
    for (let seed = 0; seed < 200; seed++) {
      const plan = buildSessionPlan(input({ seed, dueCards: cards(20) }));
      const items = plan.items;
      let run = 0;
      for (let i = 0; i < items.length; i++) {
        const questionsLeft = items.slice(i).some((it) => it.kind === "question");
        run = items[i].kind === "card" ? run + 1 : 0;
        if (questionsLeft) expect(run).toBeLessThanOrEqual(5);
      }
      const firstOpen = items.findIndex((it) => it.kind === "open");
      expect(firstOpen / items.length).toBeGreaterThanOrEqual(0.5);
      expect(firstOpen / items.length).toBeLessThanOrEqual(0.8);
    }
  });

  test("the plan is deterministic for a seed", () => {
    const a = buildSessionPlan(input({ seed: 42, dueCards: cards(20) }));
    const b = buildSessionPlan(input({ seed: 42, dueCards: cards(20) }));
    expect(a).toEqual(b);
  });
});

describe("open questions", () => {
  test("1 open item normally", () => {
    const plan = buildSessionPlan(input({ dueCards: cards(10) }));
    expect(ids(plan.items, "open")).toHaveLength(1);
    expect(plan.counts.open).toBe(1);
  });

  test("2 open items when the exam is within 7 days, from the weakest started lessons", () => {
    const lessons = [lesson("L1", 0.7), lesson("L2", 0.2), lesson("L3", 0.4), lesson("L4", 0, false)];
    const plan = buildSessionPlan(input({ lessons, examDate: NOW + 5 * DAY, dueCards: cards(10) }));
    expect(ids(plan.items, "open")).toEqual(["L2-open", "L3-open"]);
    const items = plan.items;
    expect(items[items.length - 2].kind).toBe("open");
  });

  test("0 open items when the grade quota is used up", () => {
    const plan = buildSessionPlan(input({ openAllowed: false, examDate: NOW + 5 * DAY, dueCards: cards(10) }));
    expect(ids(plan.items, "open")).toHaveLength(0);
    expect(plan.counts.open).toBe(0);
  });
});

test("nothing started → needsStart and no items", () => {
  const lessons = [lesson("L1", 0, false), lesson("L2", 0, false)];
  const plan = buildSessionPlan(input({ lessons, dueCards: cards(10) }));
  expect(plan.needsStart).toBe(true);
  expect(plan.items).toEqual([]);
  expect(plan.counts).toEqual({ cards: 0, questions: 0, open: 0 });
  expect(plan.minutes).toBe(0);
});

test("plan minutes and counts match its items", () => {
  const plan = buildSessionPlan(input({ dueCards: cards(20) }));
  expect(plan.needsStart).toBe(false);
  expect(plan.counts).toEqual({ cards: 20, questions: 9, open: 1 });
  expect(plan.minutes).toBe(10);
});

test("estimateMinutes", () => {
  expect(estimateMinutes({ cards: 20, questions: 9, open: 1 })).toBe(10);
  expect(estimateMinutes({ cards: 1, questions: 0, open: 0 })).toBe(1);
  expect(estimateMinutes({ cards: 0, questions: 0, open: 0 })).toBe(0);
});

describe("daysToExam", () => {
  // 2027-03-29 00:00 Europe/Amsterdam (CEST, UTC+2) = 2027-03-28T22:00Z
  const exam = Date.UTC(2027, 2, 28, 22, 0, 0);
  test("null without a date", () => expect(daysToExam(NOW, null)).toBeNull());
  test("0 on the exam day", () => {
    expect(daysToExam(exam, exam)).toBe(0);
    expect(daysToExam(Date.UTC(2027, 2, 29, 21, 30), exam)).toBe(0);
  });
  test("1 the day before, across the DST change", () => {
    expect(daysToExam(Date.UTC(2027, 2, 27, 23, 30), exam)).toBe(1);
    expect(daysToExam(Date.UTC(2027, 2, 28, 21, 59), exam)).toBe(1);
  });
  test("2 on the evening before the DST night", () => {
    expect(daysToExam(Date.UTC(2027, 2, 27, 22, 30), exam)).toBe(2);
  });
  test("negative after the exam", () => {
    expect(daysToExam(Date.UTC(2027, 2, 30, 12, 0), exam)).toBe(-1);
  });
});

test("sessionMastery", () => {
  expect(sessionMastery(2, 2)).toBeCloseTo(0.4);
  expect(sessionMastery(3, 3)).toBeCloseTo(0.6);
  expect(sessionMastery(1, 1)).toBeNull();
  expect(sessionMastery(5, 5)).toBe(1);
  expect(sessionMastery(0, 0)).toBeNull();
});

test("sessionXpFactor and episode XP", () => {
  expect(sessionXpFactor(0)).toBe(1);
  expect(sessionXpFactor(1)).toBe(0.5);
  expect(sessionXpFactor(2)).toBe(0.1);
  expect(sessionXpFactor(7)).toBe(0.1);
  expect(XP.episodeListen).toBe(5);
});

test("mainLessonId picks the most questions, lowest mastery on a tie", () => {
  expect(mainLessonId([])).toBeNull();
  expect(
    mainLessonId([
      { lessonId: "a", total: 2, mastery: 0.1 },
      { lessonId: "b", total: 3, mastery: 0.9 },
    ]),
  ).toBe("b");
  expect(
    mainLessonId([
      { lessonId: "a", total: 3, mastery: 0.5 },
      { lessonId: "b", total: 3, mastery: 0.2 },
      { lessonId: "c", total: 1, mastery: 0 },
    ]),
  ).toBe("b");
});
