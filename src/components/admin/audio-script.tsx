import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, Globe, Headphones, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Notice } from "@/components/notice";
import { AudioPill, Pill, audioBusy, formatAudioLength } from "@/components/admin/status-pill";
import { api, ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { errorText } from "@/lib/error-text";
import type { AdminLessonAudio } from "@/lib/types";
import { cn } from "@/lib/utils";

export const adminAudioKey = (lessonId: string) => ["admin", "lesson-audio", lessonId] as const;

/**
 * Admin-only quality check of a lesson's luisterles: status, voice, and (collapsed by
 * default) the generated script per chapter with its audio. Students never see this text.
 */
export function AudioScriptSection({ lessonId, lessonReady }: { lessonId: string; lessonReady: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: adminAudioKey(lessonId),
    queryFn: () => api.get<AdminLessonAudio>(`/admin/lessons/${lessonId}/audio`),
    refetchInterval: (q) => (q.state.data && (q.state.data.running || audioBusy(q.state.data)) ? 2500 : false),
  });
  const busy = !!data && (data.running || audioBusy(data));

  const regenerate = async () => {
    setQueueing(true);
    try {
      await api.post(`/admin/lessons/${lessonId}/audio`);
      notify.success(t("admin.audio.queued", { count: 1 }));
      await refetch();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      notify.error(
        code === "ALREADY_RUNNING" ? t("admin.audio.alreadyRunning") : errorText(e, t),
      );
    } finally {
      setQueueing(false);
    }
  };

  const chapters = data?.script?.chapters ?? [];
  const meta = data && data.voice ? [data.voice, data.model].filter(Boolean).join(" · ") : null;

  return (
    <Card variant="flat" className="mb-4 gap-0 py-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="audio-script"
          className="-mx-1 flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-md px-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Headphones className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-heading text-base font-semibold">{t("admin.audio.script")}</span>
          {data && <AudioPill audio={data} />}
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
        <Button variant="flat" size="sm" onClick={regenerate} disabled={!lessonReady || busy || queueing} title={lessonReady ? undefined : t("admin.audio.lessonNotReady")}>
          {busy || queueing ? <Spinner /> : <RefreshCw />} {data?.status === "none" ? t("admin.audio.generateOne") : t("admin.audio.regenerate")}
        </Button>
      </div>
      {open && (
        <div id="audio-script" className="space-y-4 border-t px-4 py-4">
          <p className="text-xs text-muted-foreground">{t("admin.audio.scriptHint")}</p>
          {data?.status === "error" && data.error && <Notice variant="flat" title={t("admin.audio.error")} description={<span className="break-all">{data.error}</span>} />}
          {(meta || data?.script) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {meta && (
                <Pill tone="track" dot={false}>
                  {meta}
                </Pill>
              )}
              {data!.totalMs > 0 && (
                <Pill tone="track" dot={false}>
                  {t("admin.audio.chapters", { count: data!.chapters, length: formatAudioLength(data!.totalMs) })}
                </Pill>
              )}
              {data?.script?.grounded && (
                <Pill tone="success" dot={false}>
                  <Globe /> {t("admin.audio.grounded")}
                </Pill>
              )}
            </div>
          )}
          {!chapters.length ? (
            <p className="py-4 text-center text-muted-foreground">{t("admin.audio.noScript")}</p>
          ) : (
            <ol className="space-y-4">
              {chapters.map((c, i) => {
                const file = data?.chapterList[i];
                return (
                  <li key={i} className="rounded-lg bg-accent/50 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-heading text-sm font-semibold text-primary">{t("listen.part", { n: i + 1, total: chapters.length })}</span>
                      <Pill tone="track" dot={false}>
                        {t(`admin.audio.kind.${c.kind}`)}
                      </Pill>
                      <span className="min-w-0 truncate text-sm font-bold">{c.title}</span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.text}</p>
                    {file && (
                      <audio controls preload="none" src={file.url} className="mt-2 h-9 w-full" aria-label={t("listen.part", { n: i + 1, total: chapters.length })} />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {!!data?.script?.sources.length && (
            <div>
              <h4 className="mb-1 text-xs font-bold text-muted-foreground">{t("admin.audio.sources")}</h4>
              <ul className="space-y-0.5 text-xs break-all">
                {data.script.sources.map((s) => (
                  <li key={s}>
                    {/^https?:\/\//.test(s) ? (
                      <a href={s} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                        {s}
                      </a>
                    ) : (
                      s
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
