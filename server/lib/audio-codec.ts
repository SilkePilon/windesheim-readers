// Pure audio helpers (no DB, no network): WAV parsing, MP3 encoding (lamejs, pure JS — there is
// no system ffmpeg), MP3 frame parsing for durations, a test tone, and HTTP Range parsing.
import { Mp3Encoder } from "@breezystack/lamejs";

export const MP3_KBPS = 64;

export interface Pcm {
  sampleRate: number;
  /** Mono, signed 16-bit. */
  samples: Int16Array;
}

const ascii = (b: Uint8Array, at: number, len = 4) => String.fromCharCode(...b.subarray(at, at + len));

export function isWav(b: Uint8Array) {
  return b.length >= 12 && ascii(b, 0) === "RIFF" && ascii(b, 8) === "WAVE";
}

/**
 * Parse a PCM WAV (16-bit integer or 32-bit float, any channel count) into mono 16-bit samples.
 * Tolerates streamed WAVs whose RIFF/data sizes are 0 or 0xFFFFFFFF (data runs to end of file).
 */
export function parseWav(b: Uint8Array): Pcm {
  if (!isWav(b)) throw new Error("Not a WAV file");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let off = 12;
  while (off + 8 <= b.length) {
    const id = ascii(b, off);
    let size = view.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      let format = view.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV data chunk before fmt chunk");
      if (size === 0 || size === 0xffffffff || body + size > b.length) size = b.length - body;
      return { sampleRate: fmt.sampleRate, samples: toMono16(view, body, size, fmt) };
    }
    off = body + size + (size & 1);
  }
  throw new Error("WAV has no data chunk");
}

function toMono16(view: DataView, start: number, size: number, f: { format: number; channels: number; bits: number }) {
  const bytes = f.bits / 8;
  const frame = bytes * f.channels;
  if (!frame || ![1, 3].includes(f.format) || ![16, 32].includes(f.bits) || (f.format === 3 && f.bits !== 32))
    throw new Error(`Unsupported WAV format (format ${f.format}, ${f.bits} bit)`);
  const n = Math.floor(size / frame);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let ch = 0; ch < f.channels; ch++) {
      const at = start + i * frame + ch * bytes;
      if (f.format === 3) sum += Math.max(-1, Math.min(1, view.getFloat32(at, true))) * 32767;
      else if (f.bits === 16) sum += view.getInt16(at, true);
      else sum += view.getInt32(at, true) / 65536;
    }
    out[i] = Math.round(sum / f.channels);
  }
  return out;
}

/** Build a 16-bit mono PCM WAV (used by the stub TTS and tests). */
export function pcmToWav({ sampleRate, samples }: Pcm): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const w = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i]!, true);
  return out;
}

/** A soft sine tone with short fades (stub TTS). */
export function tone(ms: number, sampleRate = 24000, hz = 440): Pcm {
  const n = Math.round((ms / 1000) * sampleRate);
  const fade = Math.min(n / 2, sampleRate * 0.02);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fade, (n - 1 - i) / fade);
    samples[i] = Math.round(4000 * env * Math.sin((2 * Math.PI * hz * i) / sampleRate));
  }
  return { sampleRate, samples };
}

/** Concatenate PCM chunks (same sample rate) with an optional silence gap between them. */
export function concatPcm(parts: Pcm[], gapMs = 0): Pcm {
  if (!parts.length) throw new Error("No audio");
  const sampleRate = parts[0]!.sampleRate;
  if (parts.some((p) => p.sampleRate !== sampleRate)) throw new Error("Sample rates differ between chunks");
  const gap = Math.round((gapMs / 1000) * sampleRate);
  const total = parts.reduce((a, p) => a + p.samples.length, 0) + gap * (parts.length - 1);
  const samples = new Int16Array(total);
  let at = 0;
  parts.forEach((p, i) => {
    samples.set(p.samples, at);
    at += p.samples.length + (i < parts.length - 1 ? gap : 0);
  });
  return { sampleRate, samples };
}

/** Encode mono PCM as MP3 (constant bitrate, default 64 kbps). */
export function encodeMp3({ sampleRate, samples }: Pcm, kbps = MP3_KBPS): Uint8Array {
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const chunks: Uint8Array[] = [];
  const push = (b: ArrayLike<number> & { buffer?: ArrayBufferLike; byteOffset?: number; length: number }) => {
    if (!b.length) return;
    // lamejs returns an Int8Array; view it as bytes without copying.
    chunks.push(b.buffer ? new Uint8Array(b.buffer, b.byteOffset ?? 0, b.length) : Uint8Array.from(b));
  };
  const BLOCK = 1152 * 8;
  for (let i = 0; i < samples.length; i += BLOCK) push(enc.encodeBuffer(samples.subarray(i, i + BLOCK)));
  push(enc.flush());
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export interface Mp3Info {
  frames: number;
  durationMs: number;
  sampleRate: number;
  /** kbps of the first frame */
  bitrate: number;
  mono: boolean;
}

const BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Walk the MPEG Layer III frames (skipping an ID3v2 tag) and sum their durations. Throws if none are valid. */
export function mp3Info(b: Uint8Array): Mp3Info {
  let off = 0;
  if (b.length > 10 && ascii(b, 0, 3) === "ID3") off = 10 + (((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f));
  let frames = 0;
  let samples = 0;
  let first: Omit<Mp3Info, "frames" | "durationMs"> | null = null;
  while (off + 4 <= b.length) {
    const h1 = b[off + 1]!, h2 = b[off + 2]!, h3 = b[off + 3]!;
    if (b[off] !== 0xff || (h1 & 0xe0) !== 0xe0) {
      if (!frames) {
        off++; // resync before the first frame only
        continue;
      }
      break;
    }
    const version = (h1 >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (h1 >> 1) & 3; // 1 = Layer III
    const brIdx = h2 >> 4;
    const srIdx = (h2 >> 2) & 3;
    if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) {
      if (!frames) {
        off++;
        continue;
      }
      break;
    }
    const bitrate = (version === 3 ? BITRATES.v1 : BITRATES.v2)[brIdx]!;
    const sampleRate = RATES[version]![srIdx]!;
    const pad = (h2 >> 1) & 1;
    const perFrame = version === 3 ? 1152 : 576;
    const len = Math.floor(((perFrame / 8) * bitrate * 1000) / sampleRate) + pad;
    if (off + len > b.length) break;
    first ??= { sampleRate, bitrate, mono: h3 >> 6 === 3 };
    frames++;
    samples += perFrame;
    off += len;
  }
  if (!first || !frames) throw new Error("No MP3 frames found");
  return { frames, durationMs: Math.round((samples / first.sampleRate) * 1000), ...first };
}

/** Normalise TTS output (WAV or MP3) to our stored format: MP3 64 kbps mono. MP3 input is kept as-is. */
export function toStoredMp3(audio: Uint8Array): { mp3: Uint8Array; durationMs: number } {
  if (isWav(audio)) {
    const pcm = parseWav(audio);
    return { mp3: encodeMp3(pcm), durationMs: Math.round((pcm.samples.length / pcm.sampleRate) * 1000) };
  }
  return { mp3: audio, durationMs: mp3Info(audio).durationMs };
}

export type RangeResult = { start: number; end: number } | "unsatisfiable" | null;

/**
 * Parse a single `Range: bytes=...` header against a resource size (inclusive `end`).
 * Returns null for "serve the whole file" (no/invalid/multi-range header — allowed by RFC 9110),
 * "unsatisfiable" for a range entirely past the end (→ 416).
 */
export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m) return null;
  const [, a, b] = m;
  if (!a && !b) return null;
  if (!a) {
    const n = Number(b);
    if (n === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  const end = b ? Math.min(Number(b), size - 1) : size - 1;
  if (b && Number(b) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end };
}
