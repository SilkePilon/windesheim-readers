import { expect, test } from "bun:test";
import { appVersion } from "../scripts/app-version";

test("APP_VERSION env wins and is shortened to 7 characters", () => {
  expect(appVersion({ APP_VERSION: "abcdef1234" }, () => "ffffff0")).toBe("abcdef1");
});

test("falls back to the git short SHA", () => {
  expect(appVersion({}, () => "1234567")).toBe("1234567");
});

test("falls back to dev when git fails", () => {
  expect(appVersion({}, () => { throw new Error("no git"); })).toBe("dev");
});
