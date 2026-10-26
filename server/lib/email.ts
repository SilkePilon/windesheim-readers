import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db, schema } from "../db";
import { renderMagicLinkEmail, type EmailLocale } from "../emails/magic-link";
import { env } from "../env";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
// public/ in dev; the Docker image only ships dist/ (Vite copies public/ into it).
const logoCandidates = ["../../public/brand/logo-email.png", "../../dist/brand/logo-email.png"].map(
  (p) => new URL(p, import.meta.url),
);
let logoBase64: string | null = null;

async function loadLogo() {
  if (logoBase64) return logoBase64;
  for (const path of logoCandidates) {
    const file = Bun.file(path);
    if (await file.exists()) return (logoBase64 = Buffer.from(await file.arrayBuffer()).toString("base64"));
  }
  throw new Error("Email logo not found (public/brand/logo-email.png)");
}

/** The stored locale of an existing user with this email, else Dutch. */
async function localeFor(email: string): Promise<EmailLocale> {
  const u = await db.query.user.findFirst({
    where: eq(schema.user.email, email.toLowerCase()),
    columns: { locale: true },
  });
  return u?.locale === "en" ? "en" : "nl";
}

export async function sendMagicLinkEmail(to: string, url: string) {
  if (!resend) {
    console.log(`\n[magic-link] ${to}\n  ${url}\n`);
    return;
  }
  const { subject, html, text } = await renderMagicLinkEmail({ url, locale: await localeFor(to) });
  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject,
    html,
    text,
    attachments: [{ filename: "logo.png", content: await loadLogo(), contentId: "logo" }],
  });
  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
