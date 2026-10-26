import { expect, test, describe } from "bun:test";
import { renderMagicLinkEmail } from "../server/emails/magic-link";
import { buildMagicLinkMessage, loadLogoBase64, resolveLocale } from "../server/lib/email-core";

describe("renderMagicLinkEmail", () => {
  test("nl: subject, logo, escaped link, copy, dark-mode meta, chunky button, text part", async () => {
    const nl = await renderMagicLinkEmail({ url: "https://x.test/verify?token=abc&cb=%2F", locale: "nl" });
    expect(nl.subject).toBe("Je inloglink voor Windesheim Readers");
    expect(nl.html).toContain('src="cid:logo"');
    expect(nl.html).toContain('href="https://x.test/verify?token=abc&amp;cb=%2F"');
    expect(nl.html).toContain("15 minuten");
    expect(nl.html).toContain('name="color-scheme"');
    expect(nl.html.toLowerCase()).toContain("#6b3cf6");
    expect(nl.html.toLowerCase()).toContain("border-bottom:4px solid #4a22c4");
    expect(nl.text).toContain("https://x.test/verify?token=abc&cb=%2F");
    expect(nl.html).not.toContain("Sign in"); // single language
  });

  test("en: subject and copy", async () => {
    const en = await renderMagicLinkEmail({ url: "https://x.test/v", locale: "en" });
    expect(en.subject).toBe("Your Windesheim Readers sign-in link");
    expect(en.html).toContain("15 minutes");
  });
});

describe("graceful degradation", () => {
  test("a missing logo yields null instead of throwing", async () => {
    expect(await loadLogoBase64(["/nonexistent/a.png", "/nonexistent/b.png"])).toBeNull();
  });

  test("an existing logo is found after a missing candidate", async () => {
    const b64 = await loadLogoBase64(["/nonexistent/a.png", new URL("../public/brand/logo-email.png", import.meta.url)]);
    expect(typeof b64).toBe("string");
    expect(b64!.length).toBeGreaterThan(100);
  });

  test("without a logo the message has no attachments and no cid image", async () => {
    const m = await buildMagicLinkMessage({ to: "a@windesheim.nl", url: "https://x.test/v", locale: "nl", logo: null });
    expect("attachments" in m).toBe(false);
    expect(m.html).not.toContain("cid:logo");
    expect(m.html).toContain('href="https://x.test/v"');
  });

  test("with a logo the message attaches it as cid:logo", async () => {
    const m = await buildMagicLinkMessage({ to: "a@windesheim.nl", url: "https://x.test/v", locale: "en", logo: "QUJD" });
    expect(m.attachments).toEqual([{ filename: "logo.png", content: "QUJD", contentId: "logo" }]);
    expect(m.html).toContain('src="cid:logo"');
    expect(m.subject).toBe("Your Windesheim Readers sign-in link");
  });

  test("a throwing locale lookup falls back to nl", async () => {
    const locale = await resolveLocale(async () => {
      throw new Error("SQLITE_BUSY");
    }, "a@windesheim.nl");
    expect(locale).toBe("nl");
  });

  test("locale lookup: en is kept, unknown users and values become nl", async () => {
    expect(await resolveLocale(async () => "en", "a@x")).toBe("en");
    expect(await resolveLocale(async () => undefined, "a@x")).toBe("nl");
    expect(await resolveLocale(async () => "de", "a@x")).toBe("nl");
  });
});
