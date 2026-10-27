import { describe, expect, test } from "bun:test";
import { concatPcm, encodeMp3, mp3Info, parseRange, parseWav, pcmToWav, tone } from "../server/lib/audio-codec";
import { chunkText, normalizeScript, scriptSchema, stubScript, TTS_MAX_CHARS, tidySpoken, type RawScript } from "../server/ai/audio-script";

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

  test("caps ideas at 5, drops empty chapters, reorders recap/quiz to the end", () => {
    const raw = { chapters: [ch("quiz"), ch("hook"), ch("idea", "  "), ...Array.from({ length: 7 }, (_, i) => ch("idea", `idee ${i}`)), ch("recap")] };
    const out = normalizeScript(raw, "nl");
    expect(out.filter((c) => c.kind === "idea").map((c) => c.text)).toEqual(["idee 0", "idee 1", "idee 2", "idee 3", "idee 4"]);
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
      { chapters: [ch("hook", "Volgens de tekst is dit **belangrijk**."), ch("idea"), ch("idea"), ch("idea"), ch("recap"), ch("quiz", "- Vraag?\n...\nAntwoord.")] },
      "nl",
    );
    expect(out[0]!.text).toBe("Volgens de reader is dit belangrijk.");
    expect(out.at(-1)!.text).toBe("Vraag?\n...\nAntwoord.");
    expect(tidySpoken("## Kop\n\n\n\nTekst")).toBe("Kop\n\nTekst");
  });

  test("the stub script is a valid script", () => {
    expect(normalizeScript({ chapters: stubScript("nl") }, "nl")).toHaveLength(6);
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
