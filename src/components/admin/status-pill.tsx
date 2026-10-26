import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";
import type { AdminReader, LessonStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PillTone = "success" | "warning" | "danger" | "track" | "busy";

// Light mode uses the shade for text: the fill colours are too light on a tinted ground.
const TONES: Record<PillTone, string> = {
  success: "bg-success/15 text-success-shade dark:text-success",
  warning: "bg-warning/15 text-warning-shade dark:text-warning",
  danger: "bg-danger/15 text-danger-shade dark:text-danger",
  track: "bg-track text-muted-foreground",
  busy: "bg-info/15 text-info-shade dark:text-info",
};

/** Calm admin pill: a tinted rounded label with a status dot (or a spinner while busy). */
export function Pill({
  tone,
  dot = true,
  spin,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone: PillTone; dot?: boolean; spin?: boolean }) {
  return (
    <span
      data-slot="pill"
      data-tone={tone}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {spin ? <Spinner /> : dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export type ReaderPillState = "published" | "ready" | "partial" | "generating" | "review" | "extracting" | "structuring" | "error";

type ReaderLike = Pick<AdminReader, "status" | "published" | "error" | "failedCount">;

/** Maps a reader to its pill state (brief table). Busy states win over "partly failed". */
export function readerPillState(r: ReaderLike): ReaderPillState {
  switch (r.status) {
    case "error":
      return "error";
    case "extracting":
    case "structuring":
    case "generating":
    case "review":
      return r.status;
    case "ready":
      if (r.failedCount > 0 || r.error) return "partial";
      return r.published ? "published" : "ready";
  }
}

/** Retry is offered on "Fout" and "Deels mislukt". */
export function canRetry(r: ReaderLike) {
  const s = readerPillState(r);
  return s === "error" || s === "partial";
}

const READER_TONE: Record<ReaderPillState, PillTone> = {
  published: "success",
  ready: "track",
  partial: "warning",
  generating: "warning",
  review: "track",
  extracting: "busy",
  structuring: "busy",
  error: "danger",
};

/** Reader status pill (readers grid and reader header). */
export function StatusPill({ reader, className }: { reader: ReaderLike; className?: string }) {
  const { t } = useTranslation();
  const state = readerPillState(reader);
  return (
    <Pill tone={READER_TONE[state]} spin={state === "extracting" || state === "structuring"} className={className}>
      {t(`admin.pill.${state}`)}
    </Pill>
  );
}

/** Per-lesson content pill for the structure table. */
export function LessonPill({ status, flashcards, questions }: { status: LessonStatus; flashcards: number; questions: number }) {
  const { t } = useTranslation();
  if (status === "ready")
    return (
      <Pill tone="success" dot={false}>
        {t("admin.contentReady", { cards: flashcards, questions })}
      </Pill>
    );
  if (status === "generating")
    return (
      <Pill tone="warning" spin>
        {t("admin.lessonPill.generating")}
      </Pill>
    );
  if (status === "error") return <Pill tone="danger">{t("admin.lessonPill.error")}</Pill>;
  return <Pill tone="track">{t("admin.lessonPill.pending")}</Pill>;
}
