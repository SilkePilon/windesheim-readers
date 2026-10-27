import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db, schema } from "./db";
import { env, isAllowedEmail } from "./env";
import { sendMagicLinkEmail } from "./lib/email";
import { AUTH_IP_HEADER } from "./lib/client-ip";

export const auth = betterAuth({
  baseURL: env.appUrl,
  secret: env.secret,
  trustedOrigins: [env.appUrl],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
      nickname: { type: "string", required: false },
      showOnLeaderboard: { type: "boolean", defaultValue: true },
      locale: { type: "string", required: false, defaultValue: null },
    },
  },
  // better-auth's own limiter (per IP, in memory) stays on as an extra layer behind ours.
  // It reads the IP our handler wrapper puts in AUTH_IP_HEADER (see server/app.ts), so both
  // agree on the address; CLIENT_IP_HEADER is listed too for calls that skip the wrapper.
  rateLimit: { enabled: !env.rateLimitDisabled },
  advanced: {
    ipAddress: { ipAddressHeaders: [AUTH_IP_HEADER, ...(env.clientIpHeader ? [env.clientIpHeader] : [])] },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  // Magic link is the only sign-in method; clicking the link verifies the email address.
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        if (!isAllowedEmail(email)) throw new APIError("FORBIDDEN", { message: "EMAIL_DOMAIN_NOT_ALLOWED" });
        await sendMagicLinkEmail(email, url);
      },
    }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/magic-link") {
        const email = String(ctx.body?.email ?? "");
        if (!isAllowedEmail(email)) {
          throw new APIError("FORBIDDEN", { message: "EMAIL_DOMAIN_NOT_ALLOWED" });
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          if (!isAllowedEmail(u.email)) return false;
          const local = u.email.split("@")[0] ?? "student";
          return {
            data: {
              ...u,
              name: u.name || local,
              role: env.adminEmails.includes(u.email.toLowerCase()) ? "admin" : "user",
            },
          };
        },
      },
    },
  },
});

export type SessionUser = typeof auth.$Infer.Session.user;
