const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 3000),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  secret: process.env.APP_SECRET ?? "dev-secret-change-me-dev-secret-change-me",
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads",
  adminEmails: list(process.env.ADMIN_EMAILS),
  allowedDomains: list(process.env.ALLOWED_EMAIL_DOMAINS ?? "windesheim.nl,student.windesheim.nl"),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Windesheim Readers <noreply@example.com>",
};

if (env.isProd && env.secret.startsWith("dev-secret")) {
  throw new Error("APP_SECRET must be set in production");
}

export function isAllowedEmail(email: string) {
  const domain = email.toLowerCase().split("@")[1];
  return !!domain && env.allowedDomains.includes(domain);
}
