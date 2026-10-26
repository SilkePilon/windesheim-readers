import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Crown, Flame, EyeOff } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Page, PageHeader, PageSpinner } from "@/components/page";
import { api } from "@/lib/api";
import { qk, useMe } from "@/lib/queries";
import type { LeaderboardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Board {
  period: "week" | "all";
  top: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  totalPlayers: number;
}

const PODIUM = [
  { cls: "bg-amber-400/20 text-amber-600 ring-amber-400", h: "h-24" },
  { cls: "bg-slate-300/30 text-slate-500 ring-slate-300", h: "h-16" },
  { cls: "bg-orange-400/20 text-orange-700 ring-orange-400", h: "h-12" },
];

function Row({ e }: { e: LeaderboardEntry }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", e.me && "bg-primary/10")}>
      <span className="w-7 text-center font-semibold text-muted-foreground tabular-nums">{e.rank}</span>
      <Avatar className="size-9">
        <AvatarFallback className="text-sm font-semibold">{e.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {e.name} {e.me && <span className="text-xs text-primary">({t("leaderboard.you")})</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("common.level", { n: e.level })}</span>
          {e.streak > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Flame className="size-3 text-orange-500" /> {e.streak}
            </span>
          )}
        </div>
      </div>
      <span className="font-semibold tabular-nums">{e.xp} XP</span>
    </div>
  );
}

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [period, setPeriod] = useState<"week" | "all">("week");
  const { data, isLoading } = useQuery({ queryKey: qk.leaderboard(period), queryFn: () => api.get<Board>(`/leaderboard?period=${period}`) });

  const podium = data?.top.slice(0, 3) ?? [];
  const rest = data?.top.slice(3) ?? [];
  const meInTop = data?.top.some((e) => e.me);

  return (
    <Page>
      <PageHeader title={t("leaderboard.title")} description={period === "week" ? t("leaderboard.resets") : undefined} />
      <Tabs value={period} onValueChange={(v) => setPeriod(v as "week" | "all")} className="mb-6">
        <TabsList className="w-full">
          <TabsTrigger value="week">{t("leaderboard.week")}</TabsTrigger>
          <TabsTrigger value="all">{t("leaderboard.all")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <PageSpinner />
      ) : !data?.top.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Crown />
            </EmptyMedia>
            <EmptyTitle>{t("leaderboard.empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Podium: 2nd, 1st, 3rd */}
          <div className="mb-6 grid grid-cols-3 items-end gap-2">
            {[1, 0, 2].map((i) => {
              const e = podium[i];
              if (!e) return <div key={i} />;
              return (
                <div key={i} className="flex flex-col items-center gap-2 text-center">
                  {i === 0 && <Crown className="size-6 text-amber-500" />}
                  <Avatar className={cn("ring-4", i === 0 ? "size-16" : "size-12", PODIUM[i]!.cls)}>
                    <AvatarFallback className={cn("font-bold", PODIUM[i]!.cls)}>{e.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="w-full truncate text-sm font-semibold">{e.name}</div>
                  <div className="text-xs font-medium text-muted-foreground tabular-nums">{e.xp} XP</div>
                  <div className={cn("flex w-full items-start justify-center rounded-t-xl pt-2 text-xl font-bold", PODIUM[i]!.h, PODIUM[i]!.cls)}>
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {rest.map((e) => (
                <Row key={`${e.rank}-${e.name}`} e={e} />
              ))}
            </div>
          )}

          {data.me && !meInTop && (
            <div className="mt-4 overflow-hidden rounded-xl border border-primary/40 bg-card">
              <Row e={data.me} />
            </div>
          )}
          {me && !me.user.showOnLeaderboard && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <EyeOff className="size-4" /> {t("leaderboard.hidden")}
            </p>
          )}
          <p className="mt-4 text-center text-xs text-muted-foreground">{t("leaderboard.players", { n: data.totalPlayers })}</p>
        </>
      )}
    </Page>
  );
}
