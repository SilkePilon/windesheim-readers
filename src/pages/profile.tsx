import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Page, PageHeader, PageSpinner } from "@/components/page";
import { api } from "@/lib/api";
import { setLocale } from "@/lib/i18n";
import { useInvalidateProgress, useMe } from "@/lib/queries";
import { BADGES, levelTitle, type BadgeId } from "@shared/game";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: me } = useMe();
  const invalidate = useInvalidateProgress();
  const [nickname, setNickname] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await authClient.signOut();
    qc.clear();
    navigate("/login");
  };

  useEffect(() => {
    if (me) setNickname(me.user.nickname ?? "");
  }, [me]);

  if (!me) return <PageSpinner />;
  const s = me.stats;
  const earned = new Set(me.badges.map((b) => b.id));

  const patch = async (body: Record<string, unknown>) => {
    await api.patch("/me", body);
    invalidate();
    toast.success(t("common.saved"));
  };

  return (
    <Page>
      <PageHeader title={t("profile.title")} description={me.user.email} />

      <Card className="mb-4">
        <CardContent>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-2xl font-semibold">{t("common.level", { n: s.level })}</div>
              <div className="text-sm text-muted-foreground">{levelTitle(s.level)}</div>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {s.intoLevel} / {s.levelSize} XP
            </div>
          </div>
          <Progress value={s.progress * 100} className="h-3" />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              [t("profile.totalXp"), s.xp],
              [t("home.streak"), s.streak],
              [t("profile.longestStreak"), s.longestStreak],
            ].map(([label, v]) => (
              <div key={label} className="rounded-lg bg-muted p-2">
                <div className="text-lg font-semibold tabular-nums">{v}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("profile.badges")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {(Object.keys(BADGES) as BadgeId[]).map((id) => (
            <div
              key={id}
              title={t(`badges.${id}.desc`)}
              className={cn("flex flex-col items-center gap-1 rounded-xl border p-3 text-center", !earned.has(id) && "opacity-35 grayscale")}
            >
              <span className="text-3xl">{BADGES[id].icon}</span>
              <span className="text-xs leading-tight font-semibold">{t(`badges.${id}.name`)}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{earned.has(id) ? t(`badges.${id}.desc`) : t("profile.lockedBadge")}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nick">{t("profile.nickname")}</FieldLabel>
              <div className="flex gap-2">
                <Input id="nick" value={nickname} maxLength={24} onChange={(e) => setNickname(e.target.value)} placeholder={me.user.name} />
                <Button variant="outline" onClick={() => patch({ nickname: nickname.trim() || null })} disabled={nickname === (me.user.nickname ?? "")}>
                  {t("common.save")}
                </Button>
              </div>
              <FieldDescription>{t("profile.nicknameHint")}</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="lb">{t("profile.showOnLeaderboard")}</FieldLabel>
              </FieldContent>
              <Switch id="lb" checked={me.user.showOnLeaderboard} onCheckedChange={(v) => patch({ showOnLeaderboard: v })} />
            </Field>
            <Field>
              <FieldLabel>{t("profile.language")}</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={i18n.language}
                onValueChange={(v) => {
                  if (v !== "nl" && v !== "en") return;
                  setLocale(v);
                  void patch({ locale: v });
                }}
              >
                <ToggleGroupItem value="nl">Nederlands</ToggleGroupItem>
                <ToggleGroupItem value="en">English</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>{t("profile.theme")}</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={theme} onValueChange={(v) => v && setTheme(v)}>
                <ToggleGroupItem value="light">
                  <Sun /> {t("profile.themes.light")}
                </ToggleGroupItem>
                <ToggleGroupItem value="dark">
                  <Moon /> {t("profile.themes.dark")}
                </ToggleGroupItem>
                <ToggleGroupItem value="system">
                  <Monitor /> {t("profile.themes.system")}
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Button variant="outline" className="mt-4 w-full" size="lg" onClick={signOut}>
        <LogOut /> {t("nav.signOut")}
      </Button>
    </Page>
  );
}
