import { describe, expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import nl from "../src/locales/nl";
import en from "../src/locales/en";

// celebrate.ts and queries.ts pull in src/lib/i18n.ts, which reads `navigator` and crashes under bun.
// Swap it for an inert instance before the components load.
mock.module("../src/lib/i18n", () => ({ default: i18next.createInstance(), setLocale: async () => {} }));
const { ReviewCard } = await import("../src/components/study/review-card");
const { OpenQuestion } = await import("../src/components/study/open-question");

async function render(node: React.ReactNode) {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    resources: { nl: { translation: nl }, en: { translation: en } },
    lng: "nl",
    interpolation: { escapeValue: false },
    returnObjects: true,
  });
  return renderToString(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("study parts", () => {
  test("ReviewCard shows the front and hides the back before the flip", async () => {
    const html = await render(
      <ReviewCard
        card={{
          id: "c1",
          lessonId: "l1",
          lessonCode: "L1",
          front: "Front side text",
          back: "Back side text",
          isNew: true,
          intervals: { again: 60_000, hard: 600_000, good: 86_400_000, easy: 172_800_000 },
        }}
        onRated={() => {}}
      />,
    );
    expect(html).toContain("Front side text");
    expect(html).not.toContain("Back side text");
    expect(html).toContain('data-flipped="false"');
  });

  test("OpenQuestion shows the prompt and a submit button", async () => {
    const html = await render(<OpenQuestion question={{ id: "q1", type: "open", prompt: "Explain the thing", difficulty: 1 }} />);
    expect(html).toContain("Explain the thing");
    expect(html).toContain(nl.open.submit);
    expect(html).toContain("<textarea");
  });
});
