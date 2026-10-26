import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import nl from "../src/locales/nl";
import en from "../src/locales/en";
import { battleErrorCopy } from "../src/pages/battle/error-copy";

const i18n = i18next.createInstance();
await i18n.init({ resources: { nl: { translation: nl }, en: { translation: en } }, lng: "nl", fallbackLng: "nl", returnObjects: true });

describe("battleErrorCopy", () => {
  test("known codes get their own title and description", () => {
    expect(battleErrorCopy(i18n, "ROOM_NOT_FOUND")).toEqual({ title: "Battle niet gevonden", description: "Check de 6-cijferige code bij je host." });
    expect(battleErrorCopy(i18n, "CLOSED").title).toBe("De host heeft de battle beëindigd");
  });
  test("unknown codes fall back to the generic copy with the code as detail", () => {
    for (const code of ["BAD_MESSAGE", "NOT_IN_ROOM", "SOMETHING_NEW"]) {
      const c = battleErrorCopy(i18n, code);
      expect(c.title).toBe("Er ging iets mis");
      expect(c.description).toBeTruthy();
      expect(c.detail).toBe(code);
    }
  });
  test("every known code has a title in both languages", () => {
    for (const lng of ["nl", "en"]) {
      const t = i18n.getFixedT(lng);
      for (const code of Object.keys(nl.battle.errors)) {
        const c = battleErrorCopy({ exists: (k: string) => i18n.exists(k, { lng }), t } as never, code);
        expect(c.title.length).toBeGreaterThan(0);
        expect(c.detail).toBeUndefined();
      }
    }
  });
});
