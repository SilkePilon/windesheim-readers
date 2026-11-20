import { describe, expect, test } from "bun:test";
import { scriptInstructions, spokenRules } from "../server/ai/audio-script";
import {
  EPISODE_SOURCE_CHARS,
  EPISODE_WORDS,
  EpisodeValidationError,
  episodeInstructions,
  episodeMaterial,
  episodeWordTargets,
  normalizeEpisodeScript,
  type RawEpisodeScript,
} from "../server/ai/episode-script";

const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");

describe("shared spoken rules", () => {
  test("the lesson prompt is byte-identical to before the extraction", () => {
    expect(sha(scriptInstructions("nl", true))).toBe("b277f7611638d5fa30b68a961031edc5ca9d79c76dea75e886dda47315c495d4");
    expect(sha(scriptInstructions("nl", false))).toBe("0a7bb2e31cf2c97b589a9f5a3ee3c3e66fd56a6c904247b3873b1086ef3867cb");
    expect(sha(scriptInstructions("en", true))).toBe("a8998aad4a6005c9b85b2e3cb914be04949f4395b37d0901e719114c238a7c62");
    expect(sha(scriptInstructions("en", false))).toBe("9e9fbfbd2dae867c5ca263234aec6808597aef846191473c2ef8eb2fc0d17cac");
  });

  test("the episode prompt carries the shared rules", () => {
    for (const lang of ["nl", "en"]) {
      const p = episodeInstructions(lang, 3);
      expect(p).toContain(spokenRules(lang, false, "episode"));
    }
    const nl = episodeInstructions("nl", 3);
    expect(nl).toContain("getallen afgerond en in woorden");
    expect(nl).toContain("Een gangbare afkorting of Engelse vakterm leg je de eerste keer kort uit.");
    expect(nl).toContain("Geen regieaanwijzingen tussen haakjes.");
    expect(nl).toContain("naburige paragrafen");
    expect(nl).toContain("[PAUZE] gebruik je alleen in de selftest.");
    expect(episodeInstructions("en", 2)).toContain("Use [PAUZE] only in the selftest.");
  });
});

describe("episodeWordTargets", () => {
  const sum = (n: number, i: 0 | 1) => {
    const t = episodeWordTargets(n);
    return t.hook[i] + t.connect[i] + t.selftest[i] + t.recap[i] + n * t.lesson[i];
  };
  test.each([1, 3, 12])("%i lessons: the targets add up to at most the episode length", (n) => {
    expect(sum(n, 1)).toBeLessThanOrEqual(EPISODE_WORDS[1]);
    expect(sum(n, 0)).toBeLessThanOrEqual(EPISODE_WORDS[0]);
    expect(sum(n, 1)).toBeGreaterThan(EPISODE_WORDS[1] - 10 * n - 1);
  });
  test("3 and 12 lessons", () => {
    expect(episodeWordTargets(3).lesson).toEqual([440, 480]);
    expect(episodeWordTargets(12).lesson).toEqual([110, 120]);
  });
});

const ch = (kind: RawEpisodeScript["chapters"][number]["kind"], text = `${kind} text.`) => ({ kind, title: kind, text });

describe("normalizeEpisodeScript", () => {
  test("puts the chapters in order and merges duplicates", () => {
    const raw = {
      title: "**Week 1**",
      chapters: [ch("recap"), ch("hook", "Eén."), ch("lesson", "L1"), ch("hook", "Twee."), ch("selftest", "Vraag?\n[PAUZE]\nHet antwoord: ja."), ch("lesson", "L2"), ch("connect")],
    };
    const out = normalizeEpisodeScript(raw, "nl", 2);
    expect(out.title).toBe("Week 1");
    expect(out.chapters.map((c) => c.kind)).toEqual(["hook", "lesson", "lesson", "connect", "selftest", "recap"]);
    expect(out.chapters[0]!.text).toBe("Eén.\n\nTwee.");
    expect(out.chapters[4]!.text).toBe("Vraag?\n[PAUZE]\nHet antwoord: ja.");
  });

  test("folds extra lesson chapters into the last one; strips pauses outside the selftest; applies reader wording", () => {
    const raw = { title: "T", chapters: [ch("hook", "Volgens de tekst [PAUZE] klopt het."), ch("lesson", "A"), ch("lesson", "B"), ch("lesson", "C"), ch("connect"), ch("selftest"), ch("recap")] };
    const out = normalizeEpisodeScript(raw, "nl", 2);
    expect(out.chapters.filter((c) => c.kind === "lesson").map((c) => c.text)).toEqual(["A", "B\n\nC"]);
    expect(out.chapters[0]!.text).toBe("Volgens de reader klopt het.");
  });

  test("rejects missing parts and too few lesson chapters", () => {
    const full = [ch("hook"), ch("lesson"), ch("lesson"), ch("connect"), ch("selftest"), ch("recap")];
    expect(() => normalizeEpisodeScript({ title: "T", chapters: full }, "nl", 3)).toThrow(EpisodeValidationError);
    expect(() => normalizeEpisodeScript({ title: "T", chapters: full }, "nl", 3)).toThrow(/2 lesson chapters \(need 3\)/);
    for (const kind of ["hook", "connect", "selftest", "recap"] as const)
      expect(() => normalizeEpisodeScript({ title: "T", chapters: full.filter((c) => c.kind !== kind) }, "nl", 2)).toThrow(EpisodeValidationError);
    // An empty chapter counts as missing.
    expect(() => normalizeEpisodeScript({ title: "T", chapters: full.map((c) => (c.kind === "recap" ? { ...c, text: "  " } : c)) }, "nl", 2)).toThrow(/recap/);
  });

  test("falls back to a title when the model gives none", () => {
    const full = [ch("hook"), ch("lesson"), ch("connect"), ch("selftest"), ch("recap")];
    expect(normalizeEpisodeScript({ title: " ", chapters: full }, "en", 1).title).toBe("This week");
  });
});

describe("episodeMaterial", () => {
  const lesson = (code: string, textLen: number) => ({
    code,
    title: `Les ${code}`,
    summary: `Samenvatting ${code}`,
    keyPoints: [`Kernpunt ${code}`],
    terms: [{ term: `Term ${code}`, definition: "Uitleg" }],
    text: `[[PAGINA 1]]\n${"x".repeat(textLen)}`,
  });

  test("keeps every summary, key point and term, and caps the total at 24 000 characters", () => {
    const out = episodeMaterial([lesson("1.1", 50_000), lesson("1.2", 50_000), lesson("1.3", 50_000)], "nl");
    expect(out.length).toBeLessThanOrEqual(EPISODE_SOURCE_CHARS);
    expect(out.length).toBeGreaterThan(EPISODE_SOURCE_CHARS - 500);
    for (const c of ["1.1", "1.2", "1.3"]) {
      expect(out).toContain(`Samenvatting ${c}`);
      expect(out).toContain(`- Kernpunt ${c}`);
      expect(out).toContain(`- Term ${c}: Uitleg`);
    }
    // Each lesson gets a fair share of the page text (not all of it to the first).
    const parts = out.split("\n\n---\n\n");
    expect(parts).toHaveLength(3);
    const xs = parts.map((p) => (p.match(/x/g) ?? []).length);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(50);
  });

  test("short material is passed whole; English labels", () => {
    const out = episodeMaterial([lesson("2.1", 10)], "en");
    expect(out).toContain("### Paragraph 2.1: Les 2.1");
    expect(out).toContain("Text from the reader:\n[[PAGINA 1]]\nxxxxxxxxxx");
  });
});
