import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { notify } from "@/lib/notify";
import { Check, ChevronRight, Download, LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page } from "@/components/page";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { InstallDrawer } from "@/components/install-drawer";
import { useInstall } from "@/lib/install";
import { api } from "@/lib/api";
import { requestErrorText } from "@/lib/error-text";
import { CharCounter } from "@/components/char-counter";
import { LIMITS, nicknameProblem, normalizeNickname } from "@shared/limits";
import { setLocale } from "@/lib/i18n";
import { useBadges, useInvalidateProgress, useMe } from "@/lib/queries";
import { levelTitleIndex } from "@shared/game";
import { BADGE_CATEGORIES, BADGE_LIST, BADGES } from "@shared/badges";
import { BadgeCell, BadgeCellSkeleton } from "@/components/game/badge-tile";
import { useEntrance } from "@/lib/motion";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const invalidate = useInvalidateProgress();
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (!me) return <ProfileSkeleton />;
  const s = me.stats;
  const num = (n: number) => n.toLocaleString(i18n.language);

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api.patch("/me", body);
      invalidate();
      notify.success(t("common.saved"));
    } catch (e) {
      notify.error(requestErrorText(e, t, t("common.error")));
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    qc.clear();
    navigate("/login");
  };

  return (
    <Page className="max-w-xl md:max-w-3xl lg:max-w-4xl">
      <header className="flex items-center gap-3">
        <PlayerAvatar
          name={me.user.displayName}
          two
          className="size-[58px] bg-primary text-[22px] text-primary-foreground shadow-[0_4px_0_var(--primary-shade)]"
        />
        <div className="min-w-0">
          <h1 className="font-heading text-[22px] leading-tight font-semibold break-words hyphens-auto">{me.user.displayName}</h1>
          <p className="text-[13px] font-bold text-muted-foreground">
            {t("common.level", { n: s.level })}: {(t("profile.levelTitles", { returnObjects: true }) as string[])[levelTitleIndex(s.level)]}
          </p>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <StatTile value={num(s.xp)} label={t("profile.totalXp")} />
        <StatTile value={num(s.streak)} label={t("home.streak")} valueClass="text-warning-shade dark:text-warning" />
        <StatTile value={num(s.longestStreak)} label={t("profile.longest")} />
      </div>

      {/* Badges take the full width (more tiles per row from md up); settings follow. */}
      <div>
        <BadgeSection />

        <Card className="mt-8 gap-0 py-1">
          <NicknameRow current={me.user.nickname ?? ""} placeholder={me.user.name} onSave={(v) => patch({ nickname: v || null })} />
          <SettingRow label={t("profile.showOnLeaderboard")} htmlFor="lb">
            <Switch id="lb" size="lg" checked={me.user.showOnLeaderboard} onCheckedChange={(v) => patch({ showOnLeaderboard: v })} />
          </SettingRow>
          <SettingRow label={t("profile.language")}>
            <Select
              value={i18n.language}
              onValueChange={(v) => {
                if (v !== "nl" && v !== "en") return;
                setLocale(v);
                void patch({ locale: v });
              }}
            >
              <SelectTrigger aria-label={t("profile.language")} className={SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="nl">Nederlands</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <ThemeRow />
          <InstallRow />
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-background px-4 py-3 text-left text-sm font-bold text-danger outline-none hover:bg-danger/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="shrink-0">{t("nav.signOut")}</span>
            <span className="ml-auto min-w-0 text-right text-xs font-semibold break-words text-muted-foreground">{me.user.email}</span>
          </button>
        </Card>
      </div>
    </Page>
  );
}

/** Loading stand-in: the header and stat tiles at their real sizes (the badges have their own). */
function ProfileSkeleton() {
  return (
    <Page className="max-w-xl md:max-w-3xl lg:max-w-4xl">
      <div aria-hidden className="animate-pulse motion-reduce:animate-none">
        <div className="flex items-center gap-3">
          <div className="size-[58px] shrink-0 rounded-full bg-track" />
          <div className="flex flex-col gap-1.5">
            <div className="h-[22px] w-40 rounded-md bg-track" />
            <div className="h-3.5 w-28 rounded-md bg-track" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[67.25px] rounded-[20px] bg-track" />
          ))}
        </div>
      </div>
    </Page>
  );
}

const SELECT =
  "-mr-2 h-9 border-0 bg-transparent font-bold text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent dark:hover:bg-transparent";

function StatTile({ value, label, valueClass }: { value: string; label: string; valueClass?: string }) {
  return (
    <Card className="items-center gap-0.5 rounded-[20px] px-2 py-3 text-center">
      <span className={cn("font-heading text-[22px] leading-tight font-semibold tabular-nums", valueClass)}>{value}</span>
      <span className="text-[11px] leading-tight font-bold text-muted-foreground">{label}</span>
    </Card>
  );
}

/** Badges grouped by category: earned medals and locked tiles with their progress. */
function BadgeSection() {
  const { t } = useTranslation();
  const { data: badges } = useBadges();
  const earned = badges?.filter((b) => b.earnedAt).length ?? 0;
  const intro = useEntrance(!!badges);
  return (
    <section aria-labelledby="badges-title">
      <h2 id="badges-title" className="mt-6 font-heading text-base font-semibold">
        {t("profile.badges")}{" "}
        {badges && <span className="text-[13px] text-muted-foreground">{t("profile.badgeCount", { n: earned, total: badges.length })}</span>}
      </h2>
      {BADGE_CATEGORIES.map((category) => {
        const title = t(`badgeCategories.${category}`);
        // While loading, skeleton cells from the catalogue hold the grid's final size.
        if (!badges) {
          const ids = BADGE_LIST.filter((d) => d.category === category).map((d) => d.id);
          return (
            <BadgeGroup key={category} title={title}>
              {ids.map((id) => (
                <BadgeCellSkeleton key={id} id={id} />
              ))}
            </BadgeGroup>
          );
        }
        const list = badges.filter((b) => BADGES[b.id]?.category === category);
        if (!list.length) return null;
        const count = t("profile.badgeCount", { n: list.filter((b) => b.earnedAt).length, total: list.length });
        return (
          <BadgeGroup key={category} title={title} count={count} intro={intro}>
            {list.map((b) => (
              <BadgeCell key={b.id} badge={b} />
            ))}
          </BadgeGroup>
        );
      })}
    </section>
  );
}

function BadgeGroup({ title, count, intro, children }: { title: string; count?: string; intro?: boolean; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="flex items-baseline justify-between gap-2 text-[13px] font-extrabold text-muted-foreground">
        <span>{title}</span>
        <span className="text-xs tabular-nums">{count ?? "\u00a0"}</span>
      </h3>
      {/* The badges fade up in turn, once, when they arrive. */}
      <div className={cn("mt-2 grid grid-cols-4 gap-x-2.5 gap-y-3 md:grid-cols-6 lg:grid-cols-8", intro && "stagger-in")}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, htmlFor, children, below }: { label: string; htmlFor?: string; children: ReactNode; below?: ReactNode }) {
  return (
    <div className="px-4 py-1.5 text-sm font-bold [&+&]:border-t-2 [&+&]:border-background">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="min-w-0">
          {label}
        </label>
        {children}
      </div>
      {below}
    </div>
  );
}

function NicknameRow({ current, placeholder, onSave }: { current: string; placeholder: string; onSave: (v: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  // The server's rule (shared/limits.ts), checked as you type.
  const invalid = nicknameProblem(value) !== null;
  const next = normalizeNickname(value);
  const dirty = next !== current;
  const save = () => {
    if (dirty && !invalid) void onSave(next);
  };
  return (
    <SettingRow
      label={t("profile.nickname")}
      htmlFor="nick"
      below={
        invalid && (
          <p id="nick-error" role="alert" className="pb-1 text-right text-xs font-semibold text-danger-shade dark:text-danger">
            {t("profile.nicknameInvalid")}
          </p>
        )
      }
    >
      <form
        className="flex min-w-0 flex-1 items-center justify-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <CharCounter value={value} max={LIMITS.nickname.max} />
        <input
          id="nick"
          value={value}
          maxLength={LIMITS.nickname.max}
          placeholder={placeholder}
          title={t("profile.nicknameHint")}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "nick-error" : undefined}
          onChange={(e) => setValue(e.target.value)}
          className={cn(
            "h-9 w-full max-w-56 min-w-0 rounded-[10px] bg-transparent px-2 text-right font-bold text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-background focus:text-foreground",
            invalid && "text-danger-shade focus:text-danger-shade dark:text-danger dark:focus:text-danger",
          )}
        />
        {dirty && !invalid && (
          <Button
            type="submit"
            variant="chunky-success"
            size="icon"
            className="size-8 shrink-0 rounded-[10px] [--press:3px]"
            aria-label={t("common.save")}
          >
            <Check strokeWidth={3} />
          </Button>
        )}
      </form>
    </SettingRow>
  );
}

/** "Install app" row: only while install is possible and the app isn't installed yet. */
function InstallRow() {
  const { t } = useTranslation();
  const { platform } = useInstall();
  const [open, setOpen] = useState(false);
  if (platform !== "prompt" && platform !== "ios-safari") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 items-center gap-3 border-t-2 border-background px-4 py-3 text-left text-sm font-bold outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <Download className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">{t("install.profileRow")}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <InstallDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

function ThemeRow() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <SettingRow label={t("profile.theme")}>
      <Select value={theme ?? "system"} onValueChange={setTheme}>
        <SelectTrigger aria-label={t("profile.theme")} className={SELECT}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="light">{t("profile.themes.light")}</SelectItem>
          <SelectItem value="dark">{t("profile.themes.dark")}</SelectItem>
          <SelectItem value="system">{t("profile.themes.system")}</SelectItem>
        </SelectContent>
      </Select>
    </SettingRow>
  );
}
