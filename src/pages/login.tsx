import { useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/queries";
import { setLocale } from "@/lib/i18n";
import { PageSpinner } from "@/components/page";
import { Notice } from "@/components/notice";
import { completeEmail, STUDENT_DOMAIN, STAFF_DOMAIN, type EmailDomainKind } from "@shared/email";
import { cn } from "@/lib/utils";
import { storageGet, storageSet } from "@/lib/storage";
import { ApiError, parseRetryAfter } from "@/lib/api";
import { rateLimitText } from "@/lib/error-text";

const ALLOWED = /@(student\.)?windesheim\.nl$/i;
const LAST_EMAIL = "wr.login.email";

/** Prefill from the last used address: the local part, plus an override if its domain isn't the guess. */
function remembered(): { value: string; override?: EmailDomainKind } {
  const last = storageGet(LAST_EMAIL);
  if (!last) return { value: "" };
  const { localPart, domain } = completeEmail(last);
  const kind: EmailDomainKind | undefined = domain === STUDENT_DOMAIN ? "student" : domain === STAFF_DOMAIN ? "staff" : undefined;
  if (!kind) return { value: last };
  return { value: localPart, override: completeEmail(localPart).domain === domain ? undefined : kind };
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { data: me, isLoading } = useMe();
  const [params] = useSearchParams();
  const [initial] = useState(remembered);
  const [value, setValue] = useState(initial.value);
  const [override, setOverride] = useState<EmailDomainKind | undefined>(initial.override);
  // `field`: a typo hint under the input; otherwise a notice (wrong domain, or the server said no).
  const [error, setError] = useState<{ kind: "field" | "domain" | "limited" | "server"; text: string } | null>(null);
  const [linkError, setLinkError] = useState(!!params.get("error"));
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <PageSpinner />;
  if (me) return <Navigate to="/" replace />;

  const completed = completeEmail(value, override);
  const other: EmailDomainKind = completed.domain === STUDENT_DOMAIN ? "staff" : "student";

  const change = (v: string) => {
    setValue(v);
    setError(null);
    // The manual domain choice sticks until the field is cleared or a full address is typed.
    if (!v.trim() || v.includes("@")) setOverride(undefined);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = completed.email;
    if (!email) return inputRef.current?.focus();
    if (/\s/.test(email)) return setError({ kind: "field", text: t("login.invalidEmail") });
    if (!ALLOWED.test(email)) return setError({ kind: "domain", text: t("login.domainError") });
    setError(null);
    setLinkError(false);
    setSending(true);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
      errorCallbackURL: "/login?error=link",
    });
    setSending(false);
    if (error) {
      // Our limits answer {error: "RATE_LIMITED", retryAfter}; better-auth's own limiter just 429.
      const body = error as unknown as Record<string, unknown>;
      const limited =
        error.status === 429 ? rateLimitText(new ApiError(429, "RATE_LIMITED", body, parseRetryAfter(body)), t) : null;
      setError(
        limited
          ? { kind: "limited", text: limited }
          : error.message === "EMAIL_DOMAIN_NOT_ALLOWED"
            ? { kind: "domain", text: t("login.domainError") }
            : { kind: "server", text: error.message ?? t("common.errorHint") },
      );
    } else {
      storageSet(LAST_EMAIL, email);
      setSentTo(email);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-8 md:justify-center md:pt-8">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <img src="/brand/logo.svg" alt="" className="size-24" />
        <h1 className="mt-6 font-heading text-[26px] leading-tight font-semibold">{t("app.name")}</h1>
        <p className="mt-1.5 text-sm font-bold text-muted-foreground">{t("app.tagline")}</p>
      </div>

      <Card className="mt-8 w-full max-w-sm gap-0 p-5">
        {sentTo ? (
          <div className="flex flex-col items-center py-2 text-center">
            <div className="grid size-16 place-items-center rounded-[20px] bg-success text-white shadow-[0_4px_0_var(--success-shade)]">
              <MailCheck className="size-8" strokeWidth={2.2} />
            </div>
            <h2 className="mt-4 font-heading text-xl font-semibold">{t("login.sent")}</h2>
            <p className="mt-2 text-sm font-semibold text-balance text-muted-foreground">
              {t("login.sentText", { email: sentTo })}
            </p>
            <Button variant="link" className="mt-3 font-heading text-sm" onClick={() => setSentTo(null)}>
              {t("login.otherEmail")}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col">
            {linkError && (
              <Notice variant="inset" tone="danger" title={t("login.linkErrorTitle")} description={t("login.linkError")} className="mb-5" />
            )}
            <label htmlFor="email" className="text-[13px] font-bold">
              {t("login.email")}
            </label>
            <div
              className={cn(
                "relative mt-2 h-12 overflow-hidden rounded-[16px] border-2 border-chunky bg-card text-[15px] font-bold transition-colors focus-within:border-primary",
                error && "border-danger focus-within:border-danger",
              )}
            >
              <input
                ref={inputRef}
                id="email"
                name="email"
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                placeholder={t("login.emailPlaceholder")}
                value={value}
                onChange={(e) => change(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? "email-error" : completed.auto ? "email-full" : undefined}
                className="absolute inset-0 size-full bg-transparent px-3.5 outline-none placeholder:font-semibold placeholder:text-muted-foreground/70"
              />
              {completed.auto && (
                // Mirrors the typed text invisibly so the suffix lands right after it.
                <div className="pointer-events-none absolute inset-0 flex items-center px-3.5 whitespace-pre">
                  <span className="invisible">{value}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOverride(other);
                      setError(null);
                      inputRef.current?.focus();
                    }}
                    aria-label={t("login.switchDomain", { domain: completed.domain, other: other === "student" ? STUDENT_DOMAIN : STAFF_DOMAIN })}
                    className="pointer-events-auto -my-1 truncate rounded-md py-1 text-muted-foreground decoration-dotted underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    @{completed.domain}
                  </button>
                </div>
              )}
            </div>
            <span id="email-full" className="sr-only">
              {completed.email}
            </span>
            {error?.kind === "field" && (
              <p id="email-error" role="alert" className="mt-2 text-left text-sm font-bold text-danger-shade dark:text-danger">
                {error.text}
              </p>
            )}
            {error && error.kind !== "field" && (
              <Notice
                id="email-error"
                variant="inset"
                tone={error.kind === "server" ? "danger" : "warning"}
                title={
                  error.kind === "domain"
                    ? t("login.domainErrorTitle")
                    : error.kind === "limited"
                      ? t("login.rateLimitedTitle")
                      : t("common.error")
                }
                description={error.text}
                className="mt-4"
              />
            )}
            <Button type="submit" variant="chunky" size="xl" className="mt-5 w-full" disabled={sending}>
              {sending && <Spinner />} {t("login.send")}
            </Button>
            <p className="mt-4 text-center text-xs font-semibold text-muted-foreground">{t("login.hint")}</p>
          </form>
        )}
      </Card>

      <div className="mt-6 flex gap-1" role="group" aria-label={t("profile.language")}>
        {(["nl", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={i18n.language === l}
            onClick={() => setLocale(l)}
            className={cn(
              "rounded-[10px] px-3 py-1.5 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              i18n.language === l ? "bg-card text-foreground shadow-[0_3px_0_var(--chunky)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l === "nl" ? "Nederlands" : "English"}
          </button>
        ))}
      </div>
    </div>
  );
}
