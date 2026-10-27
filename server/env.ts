const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v?.trim() && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  secret: process.env.APP_SECRET ?? "dev-secret-change-me-dev-secret-change-me",
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads",
  adminEmails: list(process.env.ADMIN_EMAILS),
  allowedDomains: list(process.env.ALLOWED_EMAIL_DOMAINS ?? "windesheim.nl,student.windesheim.nl"),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Windesheim Readers <noreply@example.com>",
  /**
   * Header carrying the real client IP, set by the reverse proxy (e.g. `cf-connecting-ip`
   * behind Cloudflare, or `x-forwarded-for`). Empty: use the socket address. Only set it
   * when the proxy always overwrites the header, or clients can spoof their IP.
   */
  clientIpHeader: (process.env.CLIENT_IP_HEADER ?? "").trim().toLowerCase(),
  /** Global cap on sign-in emails (all addresses together), per rolling hour and day. */
  emailLimitHourly: int(process.env.EMAIL_LIMIT_HOURLY, 30),
  emailLimitDaily: int(process.env.EMAIL_LIMIT_DAILY, 100),
  /** Turns every rate limit off. Honoured only outside production (the e2e suite uses it). */
  rateLimitDisabled: !isProd && process.env.RATE_LIMIT_DISABLED === "1",
};

if (env.isProd && env.secret.startsWith("dev-secret")) {
  throw new Error("APP_SECRET must be set in production");
}

export function isAllowedEmail(email: string) {
  const domain = email.toLowerCase().split("@")[1];
  return !!domain && env.allowedDomains.includes(domain);
}
