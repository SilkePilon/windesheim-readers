# Luisterles: AI audio summary per lesson

Date: 2026-10-27. Status: draft, awaiting owner approval.

## Intent
The owner wants a really good AI-written summary of each lesson, read aloud by a text-to-speech voice. The UI shows **only audio controls, never the text**. The listen should be interesting: engaging, with real-world examples.

The owner chose **one narrator** (not a two-host podcast).

## What makes a good spoken study summary (research → script rules)
- **Conversational, personal register.** The Mayer personalization principle: first and second person ("je", "we"), spoken language, short sentences. Conversational narration improves retention and transfer compared with formal text.
- **Segmenting.** Short, clearly separated chunks. Each chunk is a chapter in the player.
- **Signaling.** Announce the structure up front ("drie dingen"), use verbal signposts ("het tweede punt…"), and recap at the end.
- **Elaboration with concrete examples.** Link every core idea to a recognisable real-world situation or example: the Dutch context, hbo practice, the student's field. This aids understanding and encoding.
- **Retrieval practice.** End with 2–3 questions to answer in your head, each followed by a short pause, then the answer.
- **Written for the ear.** No lists or tables. No "zie figuur". Numbers are rounded and spelled out the way people say them. Abbreviations are spelled out on first use. Rhythm varies.
- **Faithful to the reader.** Core content comes **only** from the paragraph's reader text. Real-world examples must be well known and verifiable. When the generation model supports web search (Gemini Google Search grounding or OpenAI web search), examples are grounded through it. Otherwise they are limited to widely known facts, with no invented statistics, names or dates. The rule "verwijs naar 'de reader'" is kept.

### Script shape (about 5–7 minutes, about 800–1,000 spoken words), as chapters
1. **Hook**: about 20–30 seconds. A question, scenario or surprising fact from the real world that makes the topic matter, and why this paragraph is useful.
2. **Roadmap**: one sentence on what's coming.
3. **3–5 core ideas**: one chapter each, about 45–90 seconds. Each covers the idea, an example from practice, and why it matters, with a short connection to the previous idea.
4. **Recap**: about 30 seconds. The key ideas in one breath each.
5. **"Test jezelf"**: 2–3 questions, each followed by a pause of about 3 seconds, then the answer in one sentence.

Output is structured JSON: `{ chapters: [{ kind: "hook"|"roadmap"|"idea"|"recap"|"quiz", title, text }] }`. Titles are internal; at most the player shows "Deel 2 van 6". `text` is TTS-ready. Pauses are short line breaks or ellipses, provider-appropriate.

## Voice (TTS)
- New AI settings role **"Stem"** (voice), alongside "Content maken" and "Tutor & nakijken":
  - provider: Google (Gemini TTS) or OpenAI;
  - model: listed from the live model list, filtered to speech models, with free text allowed;
  - voice: a select of the provider's voices;
  - a **"Probeer stem"** button that plays a short sample.
- **Defaults:**
  - Gemini: the newest flash TTS model available (e.g. `gemini-3.8-flash-tts`, falling back to `gemini-2.5-flash-preview-tts`), with a warm, clear voice.
  - OpenAI: `gpt-4o-mini-tts` with voice instructions such as "warme, enthousiaste Nederlandse docent, rustig tempo, duidelijke articulatie".
  - Language: the reader's language.
- Through AI SDK `experimental_generateSpeech`. Gemini returns WAV/PCM and OpenAI returns MP3.
- **Encoding:** every chapter is stored as **MP3, 64 kbps mono**, encoded in pure JS (e.g. `@breezystack/lamejs`). There is no system ffmpeg. Roughly 3 MB per lesson.

## Generation and storage
- Generated **once per lesson** and shared by every student, not per user.
  - Audio is part of the admin pipeline: an extra step after content generation, with its own per-lesson status in the structure table (an "Audio" column: none / bezig / klaar / fout).
  - Admin actions: "Genereer audio" (missing only) per reader, plus per-lesson "Opnieuw". Regenerating content marks the audio stale.
- Script and audio are generated in **parallel per chapter**, with limited concurrency (2). A failed chapter is retried once. The lesson is "klaar" only when every chapter exists.
- **Storage:**
  - Files: `UPLOAD_DIR/audio/<lessonId>/<n>.mp3`.
  - New table `lesson_audio`: `lessonId`, `status`, `script` JSON (internal, never sent to students), `chapters` (`[{n, durationMs, bytes}]`), `voice`/`model`, `generatedAt`, `error`.
  - Deleting a lesson or reader deletes the files.
- Served by `GET /api/lessons/:id/audio/:n.mp3`. It requires a logged-in student, checks the lesson is published, supports HTTP `Range` (for seeking on iOS), and sends `Cache-Control: private, max-age=86400`. The service worker must not cache it, because `/api` stays network-only.
- `GET /api/lessons/:id/audio` returns `{ status, chapters: [{n, durationMs}], totalMs }`, never the text.

## Student UI
- **New activity tile "Luisteren"** (Headphones icon) on the lesson page, recommended when not yet listened. It opens a **player view** (`?view=listen`) in Speelveld style, with **no transcript**:
  - a big round play/pause button, chunky primary;
  - ‑15 s / +15 s skip;
  - a scrubber with elapsed and remaining time;
  - **chapter progress** as segment dots ("Deel 2 van 6"), tappable to jump;
  - playback speed 0.75× / 1× / 1.25× / 1.5× / 2×;
  - a gentle animated waveform or equaliser while playing, off under reduced motion.
- Chapters play back-to-back seamlessly, by preloading the next one.
- **Media Session API:** lock-screen and headphone controls (play, pause, seek, next and previous chapter), title "1.2 · <les>", artwork from the app icon.
- **Resume where you left off:** per lesson, stored server-side in `lesson_progress.listenMs`, or in localStorage as a fallback.
- **Progress and XP:** listening to ≥ 90% counts as "gelezen" (`summaryRead` → the existing mastery and XP, once). An optional "Luisteraar" badge family can come later.
- **Not ready:** show a friendly Notice, "Deze luisterles wordt nog gemaakt", and admins get a button to generate it.

## Non-goals
- No podcast with two hosts.
- No per-student personalisation.
- No transcript in the UI. The admin can view the script in the admin lesson editor for quality control.
- No offline download for now.

## Testing
- **Unit:**
  - the script schema;
  - chapter splitting and TTS input limits, with chunking long chapters under the provider limit;
  - WAV → MP3 encoding produces valid MP3 frames of the expected duration;
  - Range request parsing.
- **e2e:**
  - the audio endpoint 401s when logged out and 404s for unpublished lessons;
  - Range returns 206;
  - status JSON has no `text`;
  - listening ≥ 90% marks the lesson read once.
  - Uses a stub TTS provider in tests (env flag in non-production), so no real API calls.
- **Manual:** one real lesson generated with the owner's key (cost: one TTS run of about 6 minutes per lesson), and a listen through for quality.

## Controller calls (owner can override)
- One narrator, about 5–7 minutes, 3–5 core ideas, ending with 2–3 self-test questions.
- Gemini TTS as the default when a Gemini key exists, otherwise OpenAI.
- MP3 64 kbps mono via a JS encoder.
- Generated per lesson by the admin pipeline (not on first play).
- Listening ≥ 90% counts as reading the summary.
- The admin can read the script; students never see it.
