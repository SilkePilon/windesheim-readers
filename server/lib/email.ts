import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db, schema } from "../db";
import { env } from "../env";
import { buildMagicLinkMessage, loadLogoBase64, resolveLocale } from "./email-core";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
// public/ in dev; the Docker image only ships dist/ (Vite copies public/ into it).
const logoCandidates = ["../../public/brand/logo-email.png", "../../dist/brand/logo-email.png"].map(
  (p) => new URL(p, import.meta.url),
);
let logo: Promise<string | null> | null = null;

async function lookupLocale(email: string) {
  const u = await db.query.user.findFirst({
    where: eq(schema.user.email, email.toLowerCase()),
    columns: { locale: true },
  });
  return u?.locale;
}

export async function sendMagicLinkEmail(to: string, url: string) {
  if (!resend) {
    console.log(`\n[magic-link] ${to}\n  ${url}\n`);
    return;
  }
  logo ??= loadLogoBase64(logoCandidates);
  const message = await buildMagicLinkMessage({
    to,
    url,
    locale: await resolveLocale(lookupLocale, to),
    logo: await logo,
  });
  const { error } = await resend.emails.send({ from: env.emailFrom, ...message });
  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
