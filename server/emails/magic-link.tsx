import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";

export type EmailLocale = "nl" | "en";

const copy = {
  nl: {
    subject: "Je inloglink voor Windesheim Readers",
    preheader: "Je inloglink voor Windesheim Readers, 15 minuten geldig",
    heading: "Klaar om verder te leren?",
    body: "Tik op de knop hieronder om in te loggen bij Windesheim Readers. Je hebt geen wachtwoord nodig.",
    button: "Inloggen",
    fallback: "Werkt de knop niet? Kopieer deze link in je browser:",
    once: "Werkt maar één keer en verloopt na 15 minuten.",
    ignore: "Niet aangevraagd? Negeer deze e-mail; er gebeurt niets.",
  },
  en: {
    subject: "Your Windesheim Readers sign-in link",
    preheader: "Your sign-in link for Windesheim Readers, valid for 15 minutes",
    heading: "Ready to keep learning?",
    body: "Tap the button below to sign in to Windesheim Readers. No password needed.",
    button: "Sign in",
    fallback: "Button not working? Copy this link into your browser:",
    once: "Works only once and expires after 15 minutes.",
    ignore: "Didn't request this? Ignore this email; nothing will happen.",
  },
} satisfies Record<EmailLocale, Record<string, string>>;

const APP_NAME = "Windesheim Readers";
const headingFont = "'Fredoka','Nunito','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const bodyFont = "'Nunito','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Light palette (Speelveld tokens). Text avoids pure #FFFFFF / #000000 so forced inversion stays readable.
const c = {
  page: "#F1ECFF",
  card: "#FFFFFF",
  cardBorder: "#D9CEFF",
  text: "#241A4A",
  muted: "#8C82B5",
  primary: "#6B3CF6",
  primaryShade: "#4A22C4",
  onPrimary: "#FFFEFF",
  rule: "#E2DAFF",
};

// Honoured by clients that support prefers-color-scheme (Apple Mail, some others).
const darkCss = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  /* React Email's Body copies its inline styles onto an inner <td>, so target that too. */
  .wr-page, .wr-page > table > tbody > tr > td { background-color: #1B1536 !important; }
  .wr-card { background-color: #2A2152 !important; border-color: #110C24 !important; }
  .wr-text { color: #F1ECFF !important; }
  .wr-muted { color: #A79CD6 !important; }
  .wr-link { color: #C9B8FF !important; }
  .wr-rule { border-color: #3A2F6B !important; }
}
`;

export function MagicLinkEmail({ url, locale }: { url: string; locale: EmailLocale }) {
  const t = copy[locale];
  return (
    <Html lang={locale} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>{t.subject}</title>
        <style>{darkCss}</style>
      </Head>
      <Preview>{t.preheader}</Preview>
      <Body className="wr-page" style={{ backgroundColor: c.page, margin: 0, padding: "32px 12px", fontFamily: bodyFont }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto" }}>
          <Section
            className="wr-card"
            style={{
              backgroundColor: c.card,
              borderRadius: "24px",
              border: `2px solid ${c.cardBorder}`,
              borderBottom: `6px solid ${c.cardBorder}`,
              padding: "36px 28px 28px",
            }}
          >
            <Img
              src="cid:logo"
              alt={APP_NAME}
              width="64"
              height="64"
              style={{ display: "block", margin: "0 auto 20px", border: 0, outline: "none" }}
            />
            <Heading
              as="h1"
              className="wr-text"
              style={{
                fontFamily: headingFont,
                fontSize: "26px",
                lineHeight: "32px",
                fontWeight: 700,
                color: c.text,
                textAlign: "center",
                margin: "0 0 12px",
              }}
            >
              {t.heading}
            </Heading>
            <Text
              className="wr-text"
              style={{ fontSize: "16px", lineHeight: "24px", color: c.text, textAlign: "center", margin: "0 0 28px" }}
            >
              {t.body}
            </Text>
            <Section style={{ textAlign: "center", margin: "0 0 28px" }}>
              <Button
                href={url}
                style={{
                  backgroundColor: c.primary,
                  color: c.onPrimary,
                  fontFamily: headingFont,
                  fontSize: "16px",
                  fontWeight: 600,
                  lineHeight: "20px",
                  padding: "14px 28px",
                  borderRadius: "14px",
                  borderBottom: `4px solid ${c.primaryShade}`,
                  textDecoration: "none",
                  display: "inline-block",
                  minWidth: "160px",
                  textAlign: "center",
                }}
              >
                {t.button}
              </Button>
            </Section>
            <Text className="wr-muted" style={{ fontSize: "13px", lineHeight: "20px", color: c.muted, margin: "0 0 4px" }}>
              {t.fallback}
            </Text>
            <Text style={{ fontSize: "13px", lineHeight: "20px", margin: "0 0 20px", wordBreak: "break-all" }}>
              <Link className="wr-link" href={url} style={{ color: c.primary, textDecoration: "underline", wordBreak: "break-all" }}>
                {url}
              </Link>
            </Text>
            <Hr className="wr-rule" style={{ border: "none", borderTop: `1px solid ${c.rule}`, margin: "0 0 16px" }} />
            <Text className="wr-muted" style={{ fontSize: "13px", lineHeight: "20px", color: c.muted, margin: "0 0 4px" }}>
              {t.once}
            </Text>
            <Text className="wr-muted" style={{ fontSize: "13px", lineHeight: "20px", color: c.muted, margin: 0 }}>
              {t.ignore}
            </Text>
          </Section>
          <Text
            className="wr-muted"
            style={{
              fontFamily: headingFont,
              fontSize: "13px",
              fontWeight: 600,
              lineHeight: "20px",
              color: c.muted,
              textAlign: "center",
              margin: "16px 0 0",
            }}
          >
            {APP_NAME}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderMagicLinkEmail({ url, locale }: { url: string; locale: EmailLocale }) {
  const el = <MagicLinkEmail url={url} locale={locale} />;
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { subject: copy[locale].subject, html, text };
}
