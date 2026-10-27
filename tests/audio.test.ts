import { describe, expect, test } from "bun:test";
import { concatPcm, encodeMp3, mp3Info, parseRange, parseWav, pcmToWav, tone } from "../server/lib/audio-codec";
import {
  chunkText,
  examplesPrompt,
  isUsableScript,
  minIdeasFor,
  normalizeScript,
  PAUSE_MS,
  scriptInstructions,
  scriptPrompt,
  scriptSchema,
  splitPauses,
  stubScript,
  TTS_MAX_CHARS,
  tidySpoken,
  wordCount,
  type RawScript,
} from "../server/ai/audio-script";
import { writeScript } from "../server/ai/audio";
import { synthesize, type SpeakFn } from "../server/ai/speech";

const ch = (kind: RawScript["chapters"][number]["kind"], text = `${kind} text.`) => ({ kind, title: kind, text });

describe("script schema + normalisation", () => {
  test("schema accepts the documented shape and rejects unknown kinds", () => {
    expect(scriptSchema.safeParse({ chapters: [ch("hook"), ch("idea")] }).success).toBe(true);
    expect(scriptSchema.safeParse({ chapters: [{ kind: "outro", title: "x", text: "y" }] }).success).toBe(false);
    expect(scriptSchema.safeParse({ chapters: [{ kind: "hook", title: "x" }] }).success).toBe(false);
  });

  test("normalizes to hook(+roadmap), 3-5 ideas, recap, quiz", () => {
    const out = normalizeScript({ chapters: [ch("hook"), ch("roadmap"), ch("idea"), ch("idea"), ch("idea"), ch("recap"), ch("quiz")] }, "nl");
    expect(out.map((c) => c.kind)).toEqual(["hook", "idea", "idea", "idea", "recap", "quiz"]);
    expect(out[0]!.text).toBe("hook text.\n\nroadmap text.");
  });

  test("caps ideas at 5 by merging the extras (nothing dropped), drops empty chapters, reorders recap/quiz to the end", () => {
    const raw = { chapters: [ch("quiz"), ch("hook"), ch("idea", "  "), ...Array.from({ length: 7 }, (_, i) => ch("idea", `idee ${i}`)), ch("recap")] };
    const out = normalizeScript(raw, "nl");
    expect(out.filter((c) => c.kind === "idea").map((c) => c.text)).toEqual(["idee 0", "idee 1", "idee 2", "idee 3", "idee 4\n\nidee 5\n\nidee 6"]);
    expect(out.at(-2)!.kind).toBe("recap");
    expect(out.at(-1)!.kind).toBe("quiz");
  });

  test("rejects unusable scripts", () => {
    expect(() => normalizeScript({ chapters: [ch("hook"), ch("idea"), ch("idea"), ch("recap"), ch("quiz")] }, "nl")).toThrow(/core ideas/);
    expect(() => normalizeScript({ chapters: [ch("idea"), ch("idea"), ch("idea"), ch("recap"), ch("quiz")] }, "nl")).toThrow(/hook/);
    expect(() => normalizeScript({ chapters: [ch("hook"), ch("idea"), ch("idea"), ch("idea"), ch("recap")] }, "nl")).toThrow(/self-test/);
  });

  test("applies the reader wording rule and strips written formatting", () => {
    const out = normalizeScript(
      { chapters: [ch("hook", "Volgens de tekst is dit **belangrijk**."), ch("idea"), ch("idea"), ch("idea"), ch("recap"), ch("quiz", "- Vraag?\n[PAUZE]\nAntwoord.")] },
      "nl",
    );
    expect(out[0]!.text).toBe("Volgens de reader is dit belangrijk.");
    expect(out.at(-1)!.text).toBe("Vraag?\n[PAUZE]\nAntwoord.");
    expect(tidySpoken("## Kop\n\n\n\nTekst")).toBe("Kop\n\nTekst");
  });

  test("the stub script is a valid script", () => {
    expect(normalizeScript({ chapters: stubScript("nl") }, "nl")).toHaveLength(6);
    expect(isUsableScript(normalizeScript({ chapters: stubScript("en") }, "en"))).toBe(true);
    expect(isUsableScript([{ kind: "idea", title: "x", text: "y" }])).toBe(false);
  });

  test("a short paragraph (1-2 pages) may have 2 core ideas", () => {
    expect(minIdeasFor(4, 5)).toBe(2);
    expect(minIdeasFor(4, 4)).toBe(2);
    expect(minIdeasFor(4, 6)).toBe(3);
    const two = { chapters: [ch("hook"), ch("idea"), ch("idea"), ch("recap"), ch("quiz")] };
    expect(normalizeScript(two, "nl", { minIdeas: 2 }).filter((c) => c.kind === "idea")).toHaveLength(2);
    expect(() => normalizeScript(two, "nl")).toThrow(/2 core ideas \(need 3-5\)/);
    expect(isUsableScript(normalizeScript(two, "nl", { minIdeas: 2 }), 2)).toBe(true);
    expect(isUsableScript(normalizeScript(two, "nl", { minIdeas: 2 }), 3)).toBe(false);
  });

  test("pause markers: kept on their own line in the quiz, stripped everywhere else", () => {
    const out = normalizeScript(
      {
        chapters: [
          ch("hook", "Een vraag. [PAUZE] Verder."),
          ch("idea", "Idee [pause] een."),
          ch("idea"),
          ch("idea"),
          ch("recap", "[PAUZE]"), // only a marker → empty → dropped... and the recap is required
          ch("recap", "Samengevat."),
          ch("quiz", "Test jezelf. Wat is A? [PAUZE] Het antwoord: B.\n\n[pauze]\n\nWaarom C?\n[ PAUZE ]\nHet antwoord: D."),
        ],
      },
      "nl",
    );
    expect(out[0]!.text).toBe("Een vraag. Verder.");
    expect(out[1]!.text).toBe("Idee een.");
    expect(out.find((c) => c.kind === "recap")!.text).toBe("Samengevat.");
    expect(out.at(-1)!.text).toBe("Test jezelf. Wat is A?\n[PAUZE]\nHet antwoord: B.\n[PAUZE]\nWaarom C?\n[PAUZE]\nHet antwoord: D.");
    expect(tidySpoken("Kijk [PAUZE] hier")).toBe("Kijk hier");
  });

  test("a quiz without markers gets a pause before each answer", () => {
    const out = normalizeScript({ chapters: [ch("hook"), ch("idea"), ch("idea"), ch("idea"), ch("recap"), ch("quiz", "Test yourself. Why A? The answer: B. How C?\nThe answer: D.")] }, "en");
    expect(splitPauses(out.at(-1)!.text)).toEqual(["Test yourself. Why A?", "The answer: B. How C?", "The answer: D."]);
  });

  test("strips URLs and page markers", () => {
    expect(tidySpoken("Volgens het CBS (https://www.cbs.nl/nl-nl/cijfers?x=1) groeit dit.")).toBe("Volgens het CBS groeit dit.");
    expect(tidySpoken("Zie www.rijksoverheid.nl voor meer. Klaar.")).toBe("Zie voor meer. Klaar.");
    expect(tidySpoken("[[PAGINA 12]]\nTekst over http://x.y/z.")).toBe("Tekst over.");
  });

  test("splitPauses", () => {
    expect(splitPauses("A?\n[PAUZE]\nB.\n[PAUZE]\n")).toEqual(["A?", "B."]);
    expect(splitPauses("Geen pauze.")).toEqual(["Geen pauze."]);
  });
});

describe("script prompts", () => {
  const base = { code: "1.2", title: "Marketingmix", text: "[[PAGINA 3]]\nTekst", readerTitle: "Marketing 1", course: "Commerciële Economie" };
  test("Dutch and English variants with quiz, pause, pronunciation and URL rules", () => {
    const nl = scriptInstructions("nl", false);
    expect(nl).toMatch(/Test jezelf/);
    expect(nl).toMatch(/\[PAUZE\]/);
    expect(nl).toMatch(/Het antwoord:/);
    expect(nl).toMatch(/ja\/nee/);
    expect(nl).toMatch(/paragraaf één punt twee/);
    expect(nl).toMatch(/geen "verrassend feit"/i);
    expect(nl).toMatch(/webadres/);
    expect(nl).toMatch(/"procent"/);
    expect(nl).toMatch(/hooguit een of twee keer/);
    const en = scriptInstructions("en", true);
    expect(en).toMatch(/Test yourself/);
    expect(en).toMatch(/The answer:/);
    expect(en).toMatch(/European/);
    expect(en).not.toMatch(/Je bent/);
  });
  test("the task names reader, course and the number of ideas; retries carry the note", () => {
    const p = scriptPrompt({ ...base, language: "nl", minIdeas: 2, retryNote: "Script has no recap" });
    expect(p).toMatch(/Reader: Marketing 1/);
    expect(p).toMatch(/Commerciële Economie/);
    expect(p).toMatch(/Aantal kernideeën: 2 tot 5/);
    expect(p).toMatch(/afgekeurd: Script has no recap/);
    expect(scriptPrompt({ ...base, language: "en" })).toMatch(/Paragraph 1.2: Marketingmix\nNumber of core ideas: 3 to 5/);
    expect(examplesPrompt({ ...base, language: "nl" })).toMatch(/per kernidee .* precies één/);
    expect(examplesPrompt({ ...base, language: "nl" })).toMatch(/jaartal of datum/);
    expect(examplesPrompt({ ...base, language: "en" })).toMatch(/year or date/);
  });
});

describe("writeScript (validation + length retry)", () => {
  const words = (n: number) => Array.from({ length: n }, () => "woord").join(" ");
  const full = (ideaWords: number): RawScript => ({
    chapters: [ch("hook", words(70)), ch("idea", words(ideaWords)), ch("idea", words(ideaWords)), ch("idea", words(ideaWords)), ch("recap", words(80)), ch("quiz", words(100))],
  });

  test("an invalid script is retried once with the validation error in the prompt", async () => {
    const notes: (string | null)[] = [];
    const outputs = [{ chapters: [ch("hook"), ch("idea"), ch("idea"), ch("idea"), ch("quiz")] }, full(160)];
    const res = await writeScript(async (note) => (notes.push(note), outputs.shift()!), { language: "nl", minIdeas: 3 });
    expect(notes).toEqual([null, expect.stringMatching(/Script has no recap/)]);
    expect(res.warnings).toEqual([]);
    expect(res.chapters.filter((c) => c.kind === "idea")).toHaveLength(3);
  });

  test("still invalid after the retry → error", async () => {
    const bad = { chapters: [ch("hook")] };
    await expect(writeScript(async () => bad, { language: "nl", minIdeas: 3 })).rejects.toThrow(/still invalid after a retry: .*core ideas/);
  });

  test("a short script is retried once; the longer one is kept, with a warning if still short", async () => {
    const notes: (string | null)[] = [];
    const outputs = [full(100), full(60)];
    const res = await writeScript(async (note) => (notes.push(note), outputs.shift()!), { language: "nl", minIdeas: 3 });
    expect(notes[1]).toMatch(/te kort \(550 gesproken woorden\)/);
    expect(wordCount(res.chapters)).toBe(550);
    expect(res.warnings[0]).toMatch(/Script is short: 550/);
    const ok = await writeScript(async () => full(160), { language: "nl", minIdeas: 3 });
    expect(ok.warnings).toEqual([]);
  });

  test("provider errors are not retried", async () => {
    let calls = 0;
    await expect(writeScript(async () => (calls++, Promise.reject(new Error("401"))), { language: "nl", minIdeas: 3 })).rejects.toThrow("401");
    expect(calls).toBe(1);
  });
});

describe("pauses in synthesis", () => {
  test("pause markers become ~3 s of silence between separately spoken parts", async () => {
    const spoken: string[] = [];
    const speak: SpeakFn = async (t) => (spoken.push(t), pcmToWav(tone(500)));
    const out = await synthesize("Test jezelf. Wat is A?\n[PAUZE]\nHet antwoord: B.", { provider: "google", model: "m", voice: "Sulafat" }, "k", "nl", { speak });
    expect(spoken).toEqual(["Test jezelf. Wat is A?", "Het antwoord: B."]);
    expect(Math.abs(out.durationMs - (1000 + PAUSE_MS))).toBeLessThan(150);
    expect(out.model).toBe("m");
  });

  test("concatPcm takes a gap per boundary", () => {
    const a = tone(100, 1000);
    const out = concatPcm([a, a, a], [50, 200]);
    expect(out.samples.length).toBe(300 + 50 + 200);
    expect(out.samples.slice(100, 150).every((x) => x === 0)).toBe(true);
    expect(concatPcm([a, a], 10).samples.length).toBe(210);
  });
});

describe("TTS input chunking", () => {
  test("short text stays one chunk; empty text gives none", () => {
    expect(chunkText("Hallo daar.", 100)).toEqual(["Hallo daar."]);
    expect(chunkText("   ", 100)).toEqual([]);
  });

  test("long text splits under the limit on sentence boundaries, keeping all words in order", () => {
    const sentences = Array.from({ length: 200 }, (_, i) => `Dit is zin nummer ${i} over bedrijfskunde.`);
    const text = sentences.slice(0, 100).join(" ") + "\n\n" + sentences.slice(100).join(" ");
    for (const max of [TTS_MAX_CHARS.google, TTS_MAX_CHARS.openai, 500]) {
      const chunks = chunkText(text, max);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) {
        expect(c.length).toBeLessThanOrEqual(max);
        expect(c).toMatch(/\.$/); // never cut mid-sentence
      }
      expect(chunks.join(" ").split(/\s+/)).toEqual(text.split(/\s+/));
    }
  });

  test("never drops text: leading punctuation, ellipses, a tail without full stop", () => {
    const text = `...${"Zin met inhoud. ".repeat(30)}Wacht even… nog een staart zonder punt`;
    const chunks = chunkText(text, 120);
    expect(chunks.every((c) => c.length <= 120)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });

  test("an over-long sentence falls back to words, an over-long word is hard-cut", () => {
    const long = Array.from({ length: 300 }, () => "woord").join(" ");
    const chunks = chunkText(long, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
    expect(chunkText("x".repeat(250), 100)).toEqual(["x".repeat(100), "x".repeat(100), "x".repeat(50)]);
  });
});

describe("WAV → MP3", () => {
  test("parseWav round-trips 16-bit mono", () => {
    const t = tone(250);
    const back = parseWav(pcmToWav(t));
    expect(back.sampleRate).toBe(24000);
    expect(back.samples).toEqual(t.samples);
  });

  test("parseWav downmixes stereo and tolerates a streamed (0xFFFFFFFF) data size", () => {
    const n = 100;
    const b = new Uint8Array(44 + n * 4);
    const v = new DataView(b.buffer);
    b.set(new TextEncoder().encode("RIFF"), 0);
    v.setUint32(4, 0xffffffff, true);
    b.set(new TextEncoder().encode("WAVEfmt "), 8);
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, 16000, true);
    v.setUint32(28, 64000, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    b.set(new TextEncoder().encode("data"), 36);
    v.setUint32(40, 0xffffffff, true);
    for (let i = 0; i < n; i++) {
      v.setInt16(44 + i * 4, 1000, true);
      v.setInt16(46 + i * 4, 3000, true);
    }
    const pcm = parseWav(b);
    expect(pcm.sampleRate).toBe(16000);
    expect(pcm.samples.length).toBe(n);
    expect(pcm.samples[0]).toBe(2000);
  });

  test("encodes valid 64 kbps mono MP3 frames of the expected duration", () => {
    for (const ms of [1000, 3700]) {
      const mp3 = encodeMp3(tone(ms));
      expect(mp3[0]).toBe(0xff);
      const info = mp3Info(mp3);
      expect(info.bitrate).toBe(64);
      expect(info.mono).toBe(true);
      expect(info.sampleRate).toBe(24000);
      expect(Math.abs(info.durationMs - ms)).toBeLessThan(150); // encoder delay/padding
      expect(Math.abs(mp3.length - (ms / 1000) * 8000)).toBeLessThan(1500); // 64 kbps ≈ 8 kB/s
    }
  });

  test("concatPcm adds gaps; mp3Info rejects garbage", () => {
    const joined = concatPcm([tone(500), tone(500)], 250);
    expect(joined.samples.length).toBe(24000 * 1.25);
    expect(Math.abs(mp3Info(encodeMp3(joined)).durationMs - 1250)).toBeLessThan(150);
    expect(() => mp3Info(new Uint8Array(100))).toThrow();
  });
});

describe("HTTP Range parsing", () => {
  test("ranges", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=500-5000", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
  });
});
