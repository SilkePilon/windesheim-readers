import { expect, test, describe } from "bun:test";
import { renderMagicLinkEmail } from "../server/emails/magic-link";

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
