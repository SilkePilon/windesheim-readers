// Pure, dependency-injected helpers for sending the magic-link email (no DB or network imports, so they're unit-testable).
import { renderMagicLinkEmail, type EmailLocale } from "../emails/magic-link";

/** Base64 of the first existing file in `paths`, or null (with a warning) when none exists. Never throws. */
export async function loadLogoBase64(paths: (string | URL)[]): Promise<string | null> {
  for (const path of paths) {
    try {
      const file = Bun.file(path);
      if (await file.exists()) return Buffer.from(await file.arrayBuffer()).toString("base64");
    } catch {
      // try the next candidate
    }
  }
  console.warn("[email] logo-email.png not found; sending the magic-link email without a logo");
  return null;
}

/** The stored locale from `lookup`, falling back to "nl" for unknown users, unknown values or lookup errors. */
export async function resolveLocale(
  lookup: (email: string) => Promise<string | null | undefined>,
  email: string,
): Promise<EmailLocale> {
  try {
    return (await lookup(email)) === "en" ? "en" : "nl";
  } catch (err) {
    console.warn("[email] locale lookup failed; falling back to nl", err);
    return "nl";
  }
}

/** The Resend payload (minus `from`). The logo attachment and <img> are only included when a logo exists. */
export async function buildMagicLinkMessage({
  to,
  url,
  locale,
  logo,
}: {
  to: string;
  url: string;
  locale: EmailLocale;
  logo: string | null;
}) {
  const { subject, html, text } = await renderMagicLinkEmail({ url, locale, withLogo: logo !== null });
  return {
    to,
    subject,
    html,
    text,
    ...(logo ? { attachments: [{ filename: "logo.png", content: logo, contentId: "logo" }] } : {}),
  };
}
