// Writes /tmp/email-preview-{nl,en}.html for visual checks (cid:logo swapped for a data URI).
// Usage: bun scripts/email-preview.ts
import { renderMagicLinkEmail } from "../server/emails/magic-link";

const logo = Buffer.from(await Bun.file(new URL("../public/brand/logo-email.png", import.meta.url)).arrayBuffer());
const dataUri = `data:image/png;base64,${logo.toString("base64")}`;
const url =
  "http://localhost:5173/api/auth/magic-link/verify?token=hJ3kQ9xZpLmN2vB7wR4tY6uI8oP1aS5dF0gH&callbackURL=%2Fpath%3Ffrom%3Demail";

for (const locale of ["nl", "en"] as const) {
  const { subject, html, text } = await renderMagicLinkEmail({ url, locale });
  const out = `/tmp/email-preview-${locale}.html`;
  await Bun.write(out, html.replaceAll("cid:logo", dataUri));
  await Bun.write(`/tmp/email-preview-${locale}.txt`, `Subject: ${subject}\n\n${text}\n`);
  console.log(`${out}  (${subject})`);
}
