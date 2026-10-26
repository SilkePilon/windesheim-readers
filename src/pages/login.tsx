import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { MailCheck, Sparkles, Layers, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/queries";
import { setLocale } from "@/lib/i18n";
import { PageSpinner } from "@/components/page";

const ALLOWED = /@(student\.)?windesheim\.nl$/i;

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { data: me, isLoading } = useMe();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? t("login.linkError") : null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (isLoading) return <PageSpinner />;
  if (me) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!ALLOWED.test(value)) return setError(t("login.domainError"));
    setError(null);
    setSending(true);
    const { error } = await authClient.signIn.magicLink({
      email: value,
      callbackURL: "/",
      errorCallbackURL: "/login?error=link",
    });
    setSending(false);
    if (error) setError(error.message === "EMAIL_DOMAIN_NOT_ALLOWED" ? t("login.domainError") : (error.message ?? t("common.error")));
    else setSentTo(value);
  };

  const features = [
    { icon: Sparkles, text: t("lesson.tabs.summary") + " · AI" },
    { icon: Layers, text: t("lesson.tabs.cards") },
    { icon: Swords, text: t("battle.title") },
    { icon: Trophy, text: t("leaderboard.title") },
  ];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background p-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <img src="/icon.svg" alt="" className="mb-4 size-16" />
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{t("app.name")}</h1>
        <p className="mt-1 text-muted-foreground">{t("app.tagline")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {features.map(({ icon: Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium">
              <Icon className="size-3.5 text-primary" /> {text}
            </span>
          ))}
        </div>
      </div>

      <Card className="w-full max-w-sm">
        {sentTo ? (
          <CardContent className="flex flex-col items-center py-6 text-center">
            <div className="mb-4 rounded-full bg-emerald-500/15 p-4 text-emerald-600">
              <MailCheck className="size-8" />
            </div>
            <h2 className="text-lg font-semibold">{t("login.sent")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("login.sentText", { email: sentTo })}</p>
            <Button variant="link" className="mt-4" onClick={() => setSentTo(null)}>
              {t("login.otherEmail")}
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{t("login.title")}</CardTitle>
              <CardDescription>{t("login.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <Field data-invalid={!!error}>
                  <FieldLabel htmlFor="email">{t("login.email")}</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    required
                    placeholder={t("login.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!error}
                    className="h-11"
                  />
                  {error && <FieldError>{error}</FieldError>}
                </Field>
                <Button type="submit" size="lg" className="h-11" disabled={sending}>
                  {sending && <Spinner />} {t("login.send")}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>

      <div className="mt-6 flex gap-1 text-sm">
        {(["nl", "en"] as const).map((l) => (
          <Button key={l} variant={i18n.language === l ? "secondary" : "ghost"} size="sm" onClick={() => setLocale(l)}>
            {l === "nl" ? "Nederlands" : "English"}
          </Button>
        ))}
      </div>
      {params.get("error") && !error && (
        <Alert className="mt-4 max-w-sm">
          <AlertDescription>{t("login.linkError")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
