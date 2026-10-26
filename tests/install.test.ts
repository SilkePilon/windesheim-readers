import { expect, test } from "bun:test";
import { installPlatform, shouldShowInstall } from "../src/lib/install";

test("installPlatform", () => {
  expect(installPlatform({ ua: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile", standalone: false, hasPrompt: true })).toBe("prompt");
  expect(
    installPlatform({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      standalone: false,
      hasPrompt: false,
    }),
  ).toBe("ios-safari");
  expect(
    installPlatform({
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1",
      standalone: false,
      hasPrompt: false,
    }),
  ).toBe("unsupported");
  expect(installPlatform({ ua: "anything", standalone: true, hasPrompt: true })).toBe("installed");
  expect(installPlatform({ ua: "Mozilla/5.0 (X11; Linux x86_64) Firefox/131", standalone: false, hasPrompt: false })).toBe("unsupported");
});

test("shouldShowInstall", () => {
  const now = 2_000_000_000_000;
  expect(shouldShowInstall({ platform: "prompt", dismissedAt: null, now, isMobile: true })).toBe(true);
  expect(shouldShowInstall({ platform: "prompt", dismissedAt: now - 13 * 86_400_000, now, isMobile: true })).toBe(false);
  expect(shouldShowInstall({ platform: "prompt", dismissedAt: now - 15 * 86_400_000, now, isMobile: true })).toBe(true);
  expect(shouldShowInstall({ platform: "ios-safari", dismissedAt: null, now, isMobile: false })).toBe(false);
  expect(shouldShowInstall({ platform: "installed", dismissedAt: null, now, isMobile: true })).toBe(false);
});
