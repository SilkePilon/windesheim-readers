import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router";
import nl from "../src/locales/nl";
import en from "../src/locales/en";
import { AboutContent } from "../src/pages/about-content";

async function render(lng: "nl" | "en") {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    resources: { nl: { translation: nl }, en: { translation: en } },
    lng,
    interpolation: { escapeValue: false },
    returnObjects: true,
  });
  return renderToString(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <AboutContent />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("AboutContent", () => {
  for (const lng of ["nl", "en"] as const) {
    test(`${lng}: links, maker card and no unresolved keys`, async () => {
      const html = await render(lng);
      expect(html).toContain("https://github.com/SilkePilon/windesheim-readers");
      expect(html).toContain("#deploying");
      expect(html).toContain("Silke Pilon");
      expect(html).toContain("/brand/maker.png");
      expect(html).toContain(lng === "nl" ? "Eerstejaars student HBO-ICT aan Windesheim" : "First-year HBO-ICT student at Windesheim");
      expect(html).not.toContain("about.");
    });
  }
});
