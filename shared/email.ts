export const STAFF_DOMAIN = "windesheim.nl";
export const STUDENT_DOMAIN = "student.windesheim.nl";

export type EmailDomainKind = "staff" | "student";

export interface CompletedEmail {
  /** The full address to send to ("" for empty input). */
  email: string;
  localPart: string;
  domain: string;
  /** True when the domain was added for the user (no `@` typed). */
  auto: boolean;
}

/**
 * Completes what the user typed in the login field.
 * - Contains `@`: used as typed (trimmed, lowercased); `auto` is false.
 * - Student number (`s` + digits): `@student.windesheim.nl`.
 * - Anything else: `@windesheim.nl`.
 * `override` picks the domain instead of the guess (only when completing).
 */
export function completeEmail(input: string, override?: EmailDomainKind): CompletedEmail {
  const value = input.trim().toLowerCase();
  if (!value) return { email: "", localPart: "", domain: "", auto: false };
  const at = value.indexOf("@");
  if (at >= 0) return { email: value, localPart: value.slice(0, at), domain: value.slice(at + 1), auto: false };
  const kind = override ?? (/^s\d+$/.test(value) ? "student" : "staff");
  const domain = kind === "student" ? STUDENT_DOMAIN : STAFF_DOMAIN;
  return { email: `${value}@${domain}`, localPart: value, domain, auto: true };
}
