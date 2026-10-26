import { describe, expect, test } from "bun:test";
import { mergeLetterParts, questionCounts, readerWording } from "../server/ai/content-rules";

const L = (code: string, startPage: number, endPage: number, title = code, week = 1) => ({ code, title, week, startPage, endPage });

describe("mergeLetterParts", () => {
  test("combines A/B parts of one paragraph into a single lesson", () => {
    expect(mergeLetterParts([L("1.2A", 10, 14, "Modellen"), L("1.2B", 14, 19, "Ruis"), L("1.3A", 20, 22, "Feedback")])).toEqual([
      L("1.2", 10, 19, "Modellen"),
      L("1.3", 20, 22, "Feedback"),
    ]);
  });
  test("keeps codes without a letter and is case-insensitive", () => {
    expect(mergeLetterParts([L("2.1", 1, 3), L("2.2a", 4, 5), L("2.2b", 6, 8)])).toEqual([L("2.1", 1, 3), L("2.2", 4, 8, "2.2a")]);
  });
  test("does not merge the same paragraph when parts are not adjacent", () => {
    expect(mergeLetterParts([L("1.1A", 1, 2), L("1.2A", 3, 4), L("1.1B", 5, 6)]).map((l) => l.code)).toEqual(["1.1", "1.2", "1.1"]);
  });
  test("handles an empty list", () => {
    expect(mergeLetterParts([])).toEqual([]);
  });
});

describe("questionCounts", () => {
  test("scales with the number of pages", () => {
    expect(questionCounts(3).mc).toBe(8);
    expect(questionCounts(8).mc).toBe(12);
    expect(questionCounts(20).mc).toBe(16);
    expect(questionCounts(20).flashcards[1]).toBeGreaterThan(questionCounts(3).flashcards[1]);
  });
});

describe("readerWording", () => {
  test("refers to the reader instead of 'de tekst' (nl)", () => {
    expect(readerWording("Welke drie fasen noemt men, zoals in de tekst?", "nl")).toBe("Welke drie fasen noemt men, zoals in de reader?");
    expect(readerWording("Volgens de tekst is ruis altijd aanwezig.", "nl")).toBe("Volgens de reader is ruis altijd aanwezig.");
    expect(readerWording("Wat stelt de gegeven tekst over feedback?", "nl")).toBe("Wat stelt de reader over feedback?");
    expect(readerWording("Zoals beschreven in het tekstfragment ...", "nl")).toBe("Zoals beschreven in de reader ...");
    expect(readerWording("Dit wordt in de tekst genoemd.", "nl")).toBe("Dit wordt in de reader genoemd.");
    expect(readerWording("Uit de brontekst blijkt dat ...", "nl")).toBe("Uit de reader blijkt dat ...");
  });
  test("leaves unrelated uses of 'tekst' alone", () => {
    expect(readerWording("Een e-mail is een korte tekst met een onderwerpregel.", "nl")).toBe("Een e-mail is een korte tekst met een onderwerpregel.");
    expect(readerWording("Corrigeer de spelfouten in de tekst van de klant.", "nl")).toBe("Corrigeer de spelfouten in de tekst van de klant.");
  });
  test("english", () => {
    expect(readerWording("According to the text, noise is always present.", "en")).toBe("According to the reader, noise is always present.");
    expect(readerWording("As described in the passage above ...", "en")).toBe("As described in the reader ...");
  });
});
