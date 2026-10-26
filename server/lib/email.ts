import { Resend } from "resend";
import { env } from "../env";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendMagicLinkEmail(to: string, url: string) {
  if (!resend) {
    console.log(`\n[magic-link] ${to}\n  ${url}\n`);
    return;
  }
  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject: "Inloggen bij Windesheim Readers / Sign in",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="margin:0 0 12px">Windesheim Readers</h2>
        <p>Klik op de knop om in te loggen. De link is 15 minuten geldig.</p>
        <p style="color:#666;font-size:14px">Click the button to sign in. The link is valid for 15 minutes.</p>
        <p><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Inloggen / Sign in</a></p>
        <p style="color:#999;font-size:12px">Heb je dit niet aangevraagd? Negeer deze e-mail.</p>
      </div>`,
  });
  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
