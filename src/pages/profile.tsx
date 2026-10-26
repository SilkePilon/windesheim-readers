import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Bird,
  Brain,
  Check,
  Flame,
  GraduationCap,
  Layers,
  LogOut,
  Moon,
  Sprout,
  Star,
  Swords,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Page, PageSpinner } from "@/components/page";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { api } from "@/lib/api";
import { setLocale } from "@/lib/i18n";
import { useInvalidateProgress, useMe } from "@/lib/queries";
import { BADGES, levelTitleIndex, type BadgeId } from "@shared/game";
import { cn } from "@/lib/utils";

// Earned badge tiles: a lucide icon on a Speelveld colour (white icon, like the activity
// tiles; gold uses its dark foreground).
const BADGE_STYLE: Record<BadgeId, { icon: LucideIcon; tile: string }> = {
  first_steps: { icon: Sprout, tile: "bg-success text-white shadow-[0_4px_0_var(--success-shade)]" },
  streak_3: { icon: Flame, tile: "bg-warning text-white shadow-[0_4px_0_var(--warning-shade)]" },
  streak_7: { icon: Zap, tile: "bg-gold text-gold-foreground shadow-[0_4px_0_var(--gold-shade)]" },
  streak_30: { icon: Trophy, tile: "bg-danger text-white shadow-[0_4px_0_var(--danger-shade)]" },
  perfect_quiz: { icon: Target, tile: "bg-info text-white shadow-[0_4px_0_var(--info-shade)]" },
  cards_100: { icon: Layers, tile: "bg-success text-white shadow-[0_4px_0_var(--success-shade)]" },
  cards_500: { icon: Brain, tile: "bg-primary text-primary-foreground shadow-[0_4px_0_var(--primary-shade)]" },
  explain_master: { icon: GraduationCap, tile: "bg-info text-white shadow-[0_4px_0_var(--info-shade)]" },
  lesson_master: { icon: Star, tile: "bg-gold text-gold-foreground shadow-[0_4px_0_var(--gold-shade)]" },
  battle_winner: { icon: Swords, tile: "bg-danger text-white shadow-[0_4px_0_var(--danger-shade)]" },
  night_owl: { icon: Moon, tile: "bg-primary text-primary-foreground shadow-[0_4px_0_var(--primary-shade)]" },
  early_bird: { icon: Bird, tile: "bg-warning text-white shadow-[0_4px_0_var(--warning-shade)]" },
};

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const invalidate = useInvalidateProgress();
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (!me) return <PageSpinner />;
  const s = me.stats;
  const earnedAt = new Map(me.badges.map((b) => [b.id, b.earnedAt]));
  const ids = Object.keys(BADGES) as BadgeId[];
  const num = (n: number) => n.toLocaleString(i18n.language);

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api.patch("/me", body);
      invalidate();
      toast.success(t("common.saved"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    qc.clear();
    navigate("/login");
  };

  return (
    <Page className="max-w-xl lg:max-w-4xl">
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

      {/* Desktop: badges and settings side by side. */}
      <div className="lg:mt-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <section>
          <h2 className="mt-6 font-heading text-base font-semibold">
            {t("profile.badges")}{" "}
            <span className="text-[13px] text-muted-foreground">{t("profile.badgeCount", { n: earnedAt.size, total: ids.length })}</span>
          </h2>
          <div className="mt-2.5 grid grid-cols-4 gap-2.5">
            {ids.map((id) => (
              <BadgeTile key={id} id={id} earnedAt={earnedAt.get(id)} />
            ))}
          </div>
        </section>

        <Card className="mt-6 gap-0 py-1 lg:mt-[58px]">
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

function BadgeTile({ id, earnedAt }: { id: BadgeId; earnedAt?: string }) {
  const { t, i18n } = useTranslation();
  const { icon: Icon, tile } = BADGE_STYLE[id];
  const name = t(`badges.${id}.name`);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={name}
        className={cn(
          "grid aspect-square place-items-center rounded-[18px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "transition-[translate,box-shadow] duration-100 active:translate-y-1 active:shadow-none motion-reduce:transition-none motion-reduce:active:translate-y-0",
          earnedAt ? tile : "bg-track text-muted-foreground/60 shadow-[0_4px_0_var(--chunky)]",
        )}
      >
        <Icon className="size-[26px]" strokeWidth={2.4} />
      </PopoverTrigger>
      <PopoverContent collisionPadding={12} className="w-60 gap-1 rounded-[16px] p-3.5 shadow-[0_5px_0_var(--chunky)] ring-0">
        <p className="font-heading text-base font-semibold">{name}</p>
        <p className="text-sm font-semibold">{t(`badges.${id}.desc`)}</p>
        <p className={cn("text-xs font-bold", earnedAt ? "text-success-shade dark:text-success" : "text-muted-foreground")}>
          {earnedAt
            ? t("profile.earnedOn", {
                date: new Date(earnedAt).toLocaleDateString(i18n.language, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }),
              })
            : t("profile.lockedBadge")}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function SettingRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-1.5 text-sm font-bold [&+&]:border-t-2 [&+&]:border-background">
      <label htmlFor={htmlFor} className="min-w-0">
        {label}
      </label>
      {children}
    </div>
  );
}

function NicknameRow({ current, placeholder, onSave }: { current: string; placeholder: string; onSave: (v: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const dirty = value.trim() !== current;
  const save = () => {
    if (dirty) void onSave(value.trim());
  };
  return (
    <SettingRow label={t("profile.nickname")} htmlFor="nick">
      <form
        className="flex min-w-0 flex-1 items-center justify-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          id="nick"
          value={value}
          maxLength={24}
          placeholder={placeholder}
          title={t("profile.nicknameHint")}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-full max-w-56 min-w-0 rounded-[10px] bg-transparent px-2 text-right font-bold text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-background focus:text-foreground"
        />
        {dirty && (
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
