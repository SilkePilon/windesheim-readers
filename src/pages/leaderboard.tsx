import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Crown, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Page, PageHeader, PageSpinner } from "@/components/page";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { Podium } from "@/components/game/podium";
import { Segmented } from "@/components/game/segmented";
import { useLeaderboard, useMe } from "@/lib/queries";
import type { LeaderboardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type Period = "week" | "all";

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const [period, setPeriod] = useState<Period>("week");
  const { data, isLoading } = useLeaderboard(period);
  const xp = (n: number) => `${n.toLocaleString(i18n.language)} XP`;
  const label = (e: LeaderboardEntry) => (e.me ? t("home.you") : e.name);

  const podium = data?.top.slice(0, 3) ?? [];
  const rest = data?.top.slice(3) ?? [];
  // Your own row below the list when you're not in the shown top (rank > 50).
  const meBelow = data?.me && !data.top.some((e) => e.me) ? data.me : null;
  const hidden = me ? !me.user.showOnLeaderboard : false;

  return (
    <Page className="max-w-xl">
      <PageHeader title={t("leaderboard.title")} />
      <Segmented
        label={t("leaderboard.title")}
        value={period}
        onChange={setPeriod}
        options={[
          { value: "week", label: t("leaderboard.week") },
          { value: "all", label: t("leaderboard.all") },
        ]}
      />

      {isLoading ? (
        <PageSpinner />
      ) : !data?.top.length ? (
        <Card className="mt-5 items-center gap-3 px-6 py-8 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-gold text-gold-foreground shadow-[0_4px_0_var(--gold-shade)]">
            <Crown className="size-7" />
          </div>
          <p className="font-heading text-lg font-semibold text-balance">{t("leaderboard.empty")}</p>
        </Card>
      ) : (
        <>
          <Podium
            className="mt-5"
            entries={podium.map((e) => ({ name: label(e), avatarName: e.name, value: xp(e.xp), me: e.me }))}
          />

          {(rest.length > 0 || meBelow) && (
            <Card className="mt-4 gap-0 p-1">
              {rest.map((e) => (
                <Row key={`${e.rank}-${e.name}`} e={e} label={label(e)} xp={xp(e.xp)} hidden={e.me && hidden} />
              ))}
              {meBelow && (
                <>
                  {rest.length > 0 && (
                    <div className="py-0.5 text-center text-xs leading-none text-muted-foreground" aria-hidden>
                      ⋮
                    </div>
                  )}
                  <Row e={meBelow} label={label(meBelow)} xp={xp(meBelow.xp)} hidden={hidden} />
                </>
              )}
            </Card>
          )}
        </>
      )}

      {!isLoading && (
        <div className="mt-5 flex flex-col gap-1.5 text-center text-xs font-semibold text-muted-foreground">
          {hidden && (
            <p className="inline-flex items-center justify-center gap-1.5">
              <EyeOff className="size-3.5 shrink-0" /> {t("leaderboard.hidden")}
            </p>
          )}
          {period === "week" && <p className="text-balance">{t("leaderboard.resets")}</p>}
          {!!data?.totalPlayers && <p>{t("leaderboard.players", { n: data.totalPlayers })}</p>}
        </div>
      )}
    </Page>
  );
}

function Row({ e, label, xp, hidden }: { e: LeaderboardEntry; label: string; xp: string; hidden?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold [&+&]:border-t-2 [&+&]:border-background",
        e.me && "rounded-[14px] [&+&]:border-transparent bg-primary/10 ring-2 ring-primary ring-inset",
      )}
    >
      <span className="w-6 shrink-0 font-heading font-semibold text-muted-foreground tabular-nums">{e.rank}</span>
      <PlayerAvatar name={e.name} className="size-[30px] text-[13px]" />
      <span className="min-w-0 flex-1 leading-tight break-words hyphens-auto">{label}</span>
      {hidden && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      <span className={cn("shrink-0 font-heading font-semibold tabular-nums", e.me ? "text-primary" : "text-muted-foreground")}>
        {xp}
      </span>
    </div>
  );
}
