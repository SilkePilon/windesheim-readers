import { describe, expect, test } from "bun:test";
import { ADMIN_ITEM, NAV_ITEMS, badgeLabelKey, isNavActive, railItems } from "../src/components/shell/nav-core";

describe("railItems", () => {
  test("adds About after the student items", () => {
    expect(railItems(NAV_ITEMS).map((i) => i.key)).toEqual(["path", "review", "battle", "leaderboard", "profile", "about"]);
  });
  test("puts About before the admin item", () => {
    expect(railItems([...NAV_ITEMS, ADMIN_ITEM]).map((i) => i.key).slice(-2)).toEqual(["about", "admin"]);
  });
  test("the phone dock items never include About", () => {
    expect(NAV_ITEMS.some((i) => i.key === "about")).toBe(false);
  });
  test("About is active on /about", () => {
    expect(isNavActive("/about", "/about")).toBe(true);
  });
});

describe("badgeLabelKey", () => {
  test("Beheer counts new reports, Herhalen due cards", () => {
    expect(badgeLabelKey(ADMIN_ITEM)).toBe("nav.withNew");
    expect(badgeLabelKey(NAV_ITEMS.find((i) => i.key === "review")!)).toBe("nav.withDue");
  });
});
