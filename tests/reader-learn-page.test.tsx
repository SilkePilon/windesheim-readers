import { describe, expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router";
import nl from "../src/locales/nl";
import en from "../src/locales/en";
import { estimateParts, examLabel } from "../src/lib/reader-learn";
import { ReaderLearnView } from "../src/components/reader-learn/reader-learn-view";
import { ReaderHomeCard } from "../src/components/reader-learn/home-card";
import { SessionResultView } from "../src/components/reader-session/session-result";
import type { ReaderConceptMap as MapData, ReaderLearn, ReaderSessionResult } from "../src/lib/types";

// concept-map.tsx imports queries.ts, which pulls in src/lib/i18n.ts (reads `navigator`, crashes
// under bun). Same process-wide stub as study-parts.test.tsx; it must cover every export.
mock.module("../src/lib/i18n", () => ({ default: i18next.createInstance(), setLocale: async () => {}, ensureLocale: async () => {} }));
const { ConceptMapBody } = await import("../src/components/reader-learn/concept-map");

describe("examLabel", () => {
  test("no date", () => expect(examLabel(null)).toEqual({ key: "readerLearn.exam.none" }));
  test("today", () => expect(examLabel(0)).toEqual({ key: "readerLearn.exam.today" }));
  test("tomorrow", () => expect(examLabel(1)).toEqual({ key: "readerLearn.exam.tomorrow" }));
  test("in days", () => expect(examLabel(12)).toEqual({ key: "readerLearn.exam.inDays", n: 12 }));
  test("past", () => expect(examLabel(-3)).toEqual({ key: "readerLearn.exam.past" }));
});

describe("estimateParts", () => {
  test("keeps only the non-zero parts, in order", () => {
    expect(estimateParts({ cards: 12, questions: 0, open: 1 })).toEqual([
      { key: "readerLearn.estimate.cards", n: 12 },
      { key: "readerLearn.estimate.open", n: 1 },
    ]);
    expect(estimateParts({ cards: 0, questions: 0, open: 0 })).toEqual([]);
  });
});

const EXAM = Date.UTC(2026, 11, 2, 10);
const full: ReaderLearn = {
  reader: { id: "r1", title: "Psychologie 1", examDate: EXAM },
  daysToExam: 12,
  progress: { mastery: 0.55, masteredLessons: 8, totalLessons: 14 },
  due: 5,
  pullForward: 3,
  today: { done: false, xp: 0, sessions: 0 },
  sessionDayStreak: 4,
  estimate: { cards: 12, questions: 8, open: 1, minutes: 14 },
  needsStart: false,
  currentLessonId: "l3",
  weakLessons: [
    { id: "l2", code: "1.2", title: "Waarneming", mastery: 0.2 },
    { id: "l5", code: "2.1", title: "Leren", mastery: 0.4 },
  ],
  episodes: [
    { week: 1, title: "Het brein in vogelvlucht", durationSec: 900, positionMs: 0, listenMs: 0 },
    { week: 3, title: "Geheugen en leren", durationSec: 840, positionMs: 120_000, listenMs: 120_000 },
  ],
  conceptMap: true,
};

async function render(lng: "nl" | "en", node: React.ReactNode) {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    resources: { nl: { translation: nl }, en: { translation: en } },
    lng,
    interpolation: { escapeValue: false },
    returnObjects: true,
  });
  return renderToString(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );
}

const MAP = <div data-testid="map-slot" />;

describe("ReaderLearnView", () => {
  test("nl: full data", async () => {
    const html = await render("nl", <ReaderLearnView data={full} map={MAP} />);
    expect(html).toContain("Psychologie 1");
    expect(html).toContain("Start sessie van vandaag");
    expect(html).toContain('href="/reader/r1/session"');
    expect(html).toContain("12 kaarten · 8 vragen · 1 uitleg · ~14 min");
    expect(html).toContain("Tentamen over 12 dagen");
    expect(html).toContain("8 van 14 lessen beheerst");
    expect(html).toContain("Zwakke lessen");
    expect(html).toContain('href="/lesson/l2"');
    expect(html).toContain("Afleveringen");
    expect(html).toContain("Het brein in vogelvlucht");
    expect(html).toContain("Geheugen en leren");
    expect(html).toContain('href="/reader/r1/episode/3"');
    expect(html).toContain('data-testid="map-slot"');
    expect(html).not.toMatch(/readerLearn\./);
  });

  test("en: full data", async () => {
    const html = await render("en", <ReaderLearnView data={full} map={MAP} />);
    expect(html).toContain("Exam in 12 days");
    expect(html).toContain("8 of 14 lessons mastered");
    expect(html).toContain("12 cards · 8 questions · 1 explanation · ~14 min");
    expect(html).toContain("Geheugen en leren");
    expect(html).not.toMatch(/readerLearn\./);
  });

  test("needsStart: points to a lesson, no start button", async () => {
    const data: ReaderLearn = { ...full, needsStart: true, estimate: { cards: 0, questions: 0, open: 0, minutes: 0 } };
    const html = await render("nl", <ReaderLearnView data={data} map={MAP} />);
    expect(html).toContain("Begin eerst met een les");
    expect(html).toContain('href="/lesson/l3"');
    expect(html).not.toContain("Start sessie van vandaag");
    expect(html).not.toContain("/reader/r1/session");
  });

  test("no exam date, no episodes and no map: those sections are gone", async () => {
    const data: ReaderLearn = {
      ...full,
      reader: { ...full.reader, examDate: null },
      daysToExam: null,
      episodes: [],
      conceptMap: false,
    };
    const html = await render("nl", <ReaderLearnView data={data} map={MAP} />);
    expect(html).not.toContain("Tentamen");
    expect(html).not.toContain("Afleveringen");
    expect(html).not.toContain("map-slot");
    expect(html).not.toMatch(/readerLearn\./);
  });

  test("done today: calm state with an extra round", async () => {
    const data: ReaderLearn = { ...full, today: { done: true, xp: 90, sessions: 1 } };
    for (const lng of ["nl", "en"] as const) {
      const html = await render(lng, <ReaderLearnView data={data} map={MAP} />);
      expect(html).toContain(lng === "nl" ? "Vandaag gedaan" : "Done for today");
      expect(html).toContain(lng === "nl" ? "Extra ronde" : "Extra round");
      expect(html).toContain('href="/reader/r1/session"');
      expect(html).not.toContain(lng === "nl" ? "Start sessie van vandaag" : "Start today");
      expect(html).not.toMatch(/readerLearn\./);
    }
  });
});

describe("ReaderHomeCard", () => {
  test("nl: links to the reader page with the countdown and today's session", async () => {
    const html = await render("nl", <ReaderHomeCard data={full} />);
    expect(html).toContain('href="/reader/r1"');
    expect(html).toContain("De hele reader leren");
    expect(html).toContain("Tentamen over 12 dagen");
    expect(html).toContain("Sessie van vandaag · ~14 min");
    expect(html).not.toMatch(/readerLearn\./);
  });
  test("nl: no exam date and done today", async () => {
    const data: ReaderLearn = { ...full, daysToExam: null, today: { done: true, xp: 40, sessions: 1 } };
    const html = await render("nl", <ReaderHomeCard data={data} />);
    expect(html).toContain("Geen tentamendatum");
    expect(html).toContain("Vandaag gedaan ✓");
  });
});

describe("SessionResultView", () => {
  const result: ReaderSessionResult = {
    xp: 50,
    correct: 5,
    total: 8,
    perLesson: [
      { lessonId: "l1", code: "1.1", correct: 4, total: 4 },
      { lessonId: "l2", code: "1.2", correct: 1, total: 4 },
    ],
    dayStreak: 3,
    award: { xp: 250, gained: 50 } as ReaderSessionResult["award"],
  };
  const open = [{ id: "o1", prompt: "Leg het geheugen uit", code: "2.1", score: 72 }];

  test("nl: XP, correct/total, per-lesson links and open answers", async () => {
    const html = await render("nl", <SessionResultView readerId="r1" result={result} open={open} />);
    expect(html).toContain("+50");
    expect(html).toContain("5 van 8 goed");
    expect(html).toContain('href="/lesson/l1"');
    expect(html).toContain('href="/lesson/l2"');
    expect(html).toContain('data-weak="true"');
    expect(html).toContain("Leg het geheugen uit");
    expect(html).toContain("72");
    expect(html).toContain("Vandaag gedaan");
    expect(html).toContain('href="/reader/r1"');
  });

  test("en: no quiz questions still renders", async () => {
    const html = await render("en", <SessionResultView readerId="r1" result={{ ...result, correct: 0, total: 0, perLesson: [], xp: 0 }} open={[]} />);
    expect(html).toContain("Done for today");
    expect(html).not.toContain("/lesson/");
  });
});

describe("ConceptMapBody", () => {
  const data: MapData = {
    lessons: [
      { id: "l1", code: "2.1", title: "Netwerkmodellen", week: 2, mastery: 0.9 },
      { id: "l2", code: "2.3", title: "IP-adressering", week: 2, mastery: 0.4 },
      { id: "l3", code: "3.1", title: "Routeringsprotocollen", week: 3, mastery: 0 },
    ],
    concepts: [
      { id: "net", label: "Netwerklaag", description: "Laag 3 van het OSI-model.", lessonId: "l1" },
      { id: "mask", label: "Subnetmasker", description: "Bepaalt welk deel van een adres het netwerk is.", lessonId: "l2" },
      { id: "route", label: "Routering", description: "Pakketten de weg wijzen.", lessonId: "l3" },
      { id: "vlr", label: "Verbindingsloze routering", description: "", lessonId: "l3" },
    ],
    links: [
      { from: "net", to: "mask", label: "verdeelt" },
      { from: "mask", to: "route", label: "is nodig voor" },
      { from: "route", to: "vlr", label: "omvat" },
    ],
  };
  const panelOf = (html: string) => html.slice(html.indexOf('role="region"'));
  const strip = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");

  test("nl, no focus: weeks, lessons and every label in full; no links drawn, no panel", async () => {
    const html = await render("nl", <ConceptMapBody data={data} focusId={null} />);
    expect(html).toContain("Conceptkaart");
    expect(html).toContain("Week 2");
    expect(html).toContain("Week 3");
    for (const s of ["2.1", "Netwerkmodellen", "2.3", "IP-adressering", "3.1", "Routeringsprotocollen"]) expect(html).toContain(s);
    for (const c of data.concepts) expect(html).toContain(`>${c.label}<`);
    expect(html).not.toContain("Verbindingsloze routering…");
    expect(html).not.toContain("truncate");
    expect(html).not.toContain("data-link");
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toMatch(/readerLearn\./);
  });

  test("nl, focus: panel with lesson line, description, relation sentences and Open les", async () => {
    const html = await render("nl", <ConceptMapBody data={data} focusId="mask" />);
    expect(html).toContain('aria-pressed="true"');
    const panel = strip(panelOf(html));
    expect(panel).toContain("Subnetmasker");
    expect(panel).toContain("Les 2.3 · IP-adressering");
    expect(panel).toContain("Bepaalt welk deel van een adres het netwerk is.");
    expect(panel).toContain("→ is nodig voor Routering");
    expect(panel).toContain("← Netwerklaag verdeelt");
    expect(panel.indexOf("→ is nodig voor")).toBeLessThan(panel.indexOf("← Netwerklaag"));
    expect(panel).toContain("Open les 2.3");
    expect(panelOf(html)).toContain('href="/lesson/l2"');
    expect(panelOf(html)).toContain('aria-label="Sluiten"');
    expect(html).not.toMatch(/readerLearn\./);
  });

  test("en, focus on an unlinked-out concept: incoming only; a concept with no links says so", async () => {
    let html = await render("en", <ConceptMapBody data={data} focusId="vlr" />);
    let panel = strip(panelOf(html));
    expect(panel).toContain("Lesson 3.1 · Routeringsprotocollen");
    expect(panel).toContain("← Routering omvat");
    expect(panel).toContain("Open lesson 3.1");
    expect(panelOf(html)).toContain('aria-label="Close"');
    html = await render("en", <ConceptMapBody data={{ ...data, links: [] }} focusId="net" />);
    panel = strip(panelOf(html));
    expect(panel).toContain("No links yet");
    expect(html).not.toMatch(/readerLearn\./);
  });
});
