/**
 * Link-preview copy (page meta and OG images), nl and en. Kept server-side and tiny: the
 * crawler never runs the SPA, so it never sees src/locales. Wording follows src/locales.
 */
export type OgLang = "nl" | "en";

export const OG_COPY = {
  nl: {
    appName: "Windesheim Readers",
    tagline: "Leer je reader, speel je les",
    description:
      "Leer je Windesheim-reader met korte lessen, flashcards, quizzen, luisterlessen en live Quiz Battles tegen je klasgenoten.",
    imageAlt: "Windesheim Readers: leer je reader, speel je les",
    features: ["Flashcards", "Quiz", "Luisterles", "Battle"],
    loginTitle: "Inloggen · Windesheim Readers",
    loginDescription: "Log in met je Windesheim-mail. Je krijgt een inloglink, geen wachtwoord nodig.",
    lessonTitle: "Les in Windesheim Readers",
    lessonDescription: "Een les uit je reader: samenvatting, flashcards en een quiz. Log in om verder te spelen.",
    battle: {
      title: "Quiz Battle",
      join: "Doe mee met de Quiz Battle!",
      ended: "Deze Quiz Battle is afgelopen",
      joinGeneric: "Speel live tegen je klasgenoten",
      howTo: "Ga naar Battle en voer de code in",
      pageTitle: (code: string) => `Quiz Battle ${code} · Windesheim Readers`,
      pageTitleGeneric: "Quiz Battle · Windesheim Readers",
      description: (host: string, lesson: string, players: number) =>
        `${host} host een Quiz Battle over ${lesson}. ${players === 1 ? "1 speler" : `${players} spelers`} in de lobby. Doe mee!`,
      descriptionPlaying: (host: string, lesson: string) => `${host} speelt een Quiz Battle over ${lesson}.`,
      descriptionEnded: (host: string, lesson: string) => `De Quiz Battle van ${host} over ${lesson} is afgelopen.`,
      descriptionGeneric: "Speel live tegen je klasgenoten, zoals Kahoot. Doe mee met de 6-cijferige code.",
      imageAlt: (code: string) => `Uitnodiging voor Quiz Battle ${code}`,
      host: "Host",
      lesson: "Les",
      players: (n: number) => (n === 1 ? "1 speler" : `${n} spelers`),
      status: { lobby: "Lobby open", playing: "Bezig", ended: "Afgelopen" },
      questions: (n: number) => (n === 1 ? "1 vraag" : `${n} vragen`),
      seconds: (n: number) => `${n} s per vraag`,
      points: { normal: null, lastDouble: "Laatste vraag dubbel", allDouble: "Dubbele punten" },
      difficulty: { easy: "Makkelijk", mixed: null, hard: "Moeilijk" },
      moreLessons: (n: number) => `+${n} ${n === 1 ? "les" : "lessen"}`,
      live: "Live",
      kahoot: "Tot 200 spelers",
      podium: "Podium en XP",
    },
  },
  en: {
    appName: "Windesheim Readers",
    tagline: "Learn your reader, play your lesson",
    description:
      "Learn your Windesheim course reader with short lessons, flashcards, quizzes, audio lessons and live Quiz Battles against your classmates.",
    imageAlt: "Windesheim Readers: learn your reader, play your lesson",
    features: ["Flashcards", "Quiz", "Listen", "Battle"],
    loginTitle: "Sign in · Windesheim Readers",
    loginDescription: "Sign in with your Windesheim email. You get a sign-in link, no password needed.",
    lessonTitle: "Lesson in Windesheim Readers",
    lessonDescription: "A lesson from your reader: summary, flashcards and a quiz. Sign in to keep playing.",
    battle: {
      title: "Quiz Battle",
      join: "Join the Quiz Battle!",
      ended: "This Quiz Battle has ended",
      joinGeneric: "Play live against your classmates",
      howTo: "Go to Battle and enter the code",
      pageTitle: (code: string) => `Quiz Battle ${code} · Windesheim Readers`,
      pageTitleGeneric: "Quiz Battle · Windesheim Readers",
      description: (host: string, lesson: string, players: number) =>
        `${host} is hosting a Quiz Battle on ${lesson}. ${players === 1 ? "1 player" : `${players} players`} in the lobby. Join in!`,
      descriptionPlaying: (host: string, lesson: string) => `${host} is playing a Quiz Battle on ${lesson}.`,
      descriptionEnded: (host: string, lesson: string) => `${host}'s Quiz Battle on ${lesson} has ended.`,
      descriptionGeneric: "Play live against your classmates, like Kahoot. Join with the 6-digit code.",
      imageAlt: (code: string) => `Invite to Quiz Battle ${code}`,
      host: "Host",
      lesson: "Lesson",
      players: (n: number) => (n === 1 ? "1 player" : `${n} players`),
      status: { lobby: "Lobby open", playing: "In progress", ended: "Finished" },
      questions: (n: number) => (n === 1 ? "1 question" : `${n} questions`),
      seconds: (n: number) => `${n} s per question`,
      points: { normal: null, lastDouble: "Last question double", allDouble: "Double points" },
      difficulty: { easy: "Easy", mixed: null, hard: "Hard" },
      moreLessons: (n: number) => `+${n} ${n === 1 ? "lesson" : "lessons"}`,
      live: "Live",
      kahoot: "Up to 200 players",
      podium: "Podium and XP",
    },
  },
} satisfies Record<OgLang, unknown>;

/**
 * `?lang=` wins; otherwise the first nl/en tag in Accept-Language (by q-value); nl by default.
 */
export function pickLang(query: string | undefined | null, acceptLanguage: string | undefined | null): OgLang {
  const q = query?.trim().toLowerCase();
  if (q === "en" || q === "nl") return q;
  if (!acceptLanguage) return "nl";
  const tags = acceptLanguage
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const qp = params.find((p) => p.trim().startsWith("q="));
      const weight = qp ? Number(qp.trim().slice(2)) : 1;
      return { lang: tag.split("-")[0], weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((t) => t.weight > 0 && (t.lang === "nl" || t.lang === "en"))
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  return (tags[0]?.lang as OgLang | undefined) ?? "nl";
}
