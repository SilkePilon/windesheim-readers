import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { PageError, PageSpinner } from "@/components/page";
import { Cover, ListenView } from "@/components/listen/listen-view";
import { api, ApiError } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { episodeAudioSource } from "@/lib/listen";
import { qk, useInvalidateProgress } from "@/lib/queries";
import { EPISODE_DONE_SHARE } from "@/lib/reader-learn";
import type { EpisodeMeta, ReaderLearn } from "@/lib/types";
import { XP } from "@shared/game";

/** `/reader/:id/episode/:week`: the weekly episode in the shared listen player. */
export default function ReaderEpisodePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { id = "", week: rawWeek = "" } = useParams();
  const week = Number.parseInt(rawWeek, 10);
  const { data, error, isError, isFetching, refetch } = useQuery({
    queryKey: qk.readerEpisode(id, week),
    queryFn: () => api.get<EpisodeMeta>(`/readers/${id}/episodes/${week}`),
    enabled: Number.isInteger(week),
    // Not ready / hidden are answers, not hiccups.
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 409)) && n < 1,
  });
  // The reader title is a nicety: only when the overview is already cached.
  const readerTitle = qc.getQueryData<ReaderLearn>(qk.readerLearn(id))?.reader.title;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id, week]);

  const status = error instanceof ApiError ? error.status : 0;
  let body;
  if (!Number.isInteger(week) || status === 404)
    body = <Notice tone="info" title={t("readerLearn.episode.notFound")} action={<BackButton id={id} />} />;
  else if (status === 409)
    body = <Notice tone="info" title={t("readerLearn.episode.notReady")} description={t("readerLearn.episode.notReadyHint")} action={<BackButton id={id} />} />;
  else if (isError && !data) return <PageError title={t("readerLearn.episode.loadFailed")} onRetry={() => void refetch()} retrying={isFetching} />;
  else if (!data) return <PageSpinner />;
  else body = <EpisodePlayer readerId={id} ep={data} readerTitle={readerTitle} />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-8 md:py-8">
      <header className="mb-5 flex items-center gap-3">
        <Button asChild variant="chunky-surface" size="icon-xl" className="[--press:3px]">
          <Link to={`/reader/${id}`} aria-label={t("readerLearn.episode.backToReader")}>
            <ChevronLeft strokeWidth={2.5} />
          </Link>
        </Button>
        <div className="min-w-0">
          {readerTitle && <div className="text-sm break-words text-muted-foreground">{readerTitle}</div>}
          <h1 className="font-heading text-2xl leading-tight font-semibold">
            {Number.isInteger(week) ? t("readerLearn.episode.week", { week }) : t("readerLearn.episode.badge")}
          </h1>
        </div>
      </header>
      {body}
    </div>
  );
}

function BackButton({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <Button asChild variant="chunky" size="lg">
      <Link to={`/reader/${id}`}>{t("readerLearn.episode.backToReader")}</Link>
    </Button>
  );
}

function EpisodePlayer({ readerId, ep, readerTitle }: { readerId: string; ep: EpisodeMeta; readerTitle?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const invalidate = useInvalidateProgress();
  // Memoized on the audio itself, not the query object: a refetch with the same chapters keeps the player.
  const version = `${ep.version}:${ep.chapters.map((c) => `${c.n}:${c.durationMs}`).join(",")}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => episodeAudioSource(readerId, ep), [readerId, ep.week, version]);
  const weekLabel = t("readerLearn.episode.week", { week: ep.week });
  return (
    <ListenView
      source={source}
      header={({ playing }) => <Cover code={`W${ep.week}`} title={ep.title} playing={playing} badge={t("readerLearn.episode.badge")} />}
      meta={{ title: `${weekLabel} · ${ep.title}`, artist: readerTitle ?? "Windesheim Readers" }}
      awarded={ep.totalMs > 0 && ep.listenMs >= EPISODE_DONE_SHARE * ep.totalMs}
      xp={XP.episodeListen}
      xpHint={t("readerLearn.episode.xpHint", { xp: XP.episodeListen })}
      onProgress={(body) => {
        qc.setQueryData<EpisodeMeta>(qk.readerEpisode(readerId, ep.week), (old) => (old ? { ...old, listenMs: body.listenMs } : old));
        // The overview's resume bars; refetched when the reader page mounts again.
        void qc.invalidateQueries({ queryKey: qk.readerLearn(readerId), refetchType: "none" });
      }}
      onAward={(award) => {
        celebrate(award);
        invalidate();
      }}
    />
  );
}
