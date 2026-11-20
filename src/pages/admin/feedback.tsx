import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRight, Image as ImageIcon, Inbox } from "lucide-react";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES, type FeedbackStatus, type FeedbackType } from "@shared/feedback";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageSpinner } from "@/components/page";
import { FeedbackDetail, FeedbackStatusPill, FeedbackTypePill, useTimeAgo } from "@/components/admin/feedback-detail";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { FeedbackList, FeedbackRow } from "@/lib/types";

type StatusFilter = "open" | FeedbackStatus | "all";
const STATUS_FILTERS: StatusFilter[] = ["open", ...FEEDBACK_STATUSES, "all"];

const matchesStatus = (f: StatusFilter, s: FeedbackStatus) => (f === "all" ? true : f === "open" ? s !== "done" : s === f);

/** The first line of a message, for the row (plain text). */
const firstLine = (s: string) => (s.trim().split(/[\r\n\u2028\u2029]/)[0] ?? "").trim();

/**
 * Admin feedback inbox: every report fetched once (no server paging: a few hundred rows is
 * fine), filtered here by status (default "open" = new + in progress) and type.
 */
export default function AdminFeedbackPage() {
  const { t } = useTranslation();
  const ago = useTimeAgo();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [type, setType] = useState<FeedbackType | "all">("all");
  // `selectedId` stays set while the detail closes, so its content doesn't blank mid-animation.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: qk.adminFeedback,
    queryFn: () => api.get<FeedbackList>("/admin/feedback"),
  });
  if (isLoading || !data) return <PageSpinner />;

  const items = data.items.filter((r) => matchesStatus(status, r.status) && (type === "all" || r.type === type));
  const selected = data.items.find((r) => r.id === selectedId) ?? null;
  const show = (r: FeedbackRow) => {
    setSelectedId(r.id);
    setOpen(true);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger aria-label={t("admin.inbox.statusFilter")} className="min-w-0 flex-1 sm:w-44 sm:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`admin.inbox.filter.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as FeedbackType | "all")}>
          <SelectTrigger aria-label={t("admin.inbox.typeFilter")} className="min-w-0 flex-1 sm:w-40 sm:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.inbox.allTypes")}</SelectItem>
            {FEEDBACK_TYPES.map((ty) => (
              <SelectItem key={ty} value={ty}>
                {t(`feedback.types.${ty}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="w-full text-muted-foreground sm:ml-auto sm:w-auto" aria-live="polite">
          {t("admin.inbox.count", { count: items.length })}
        </p>
      </div>

      {items.length === 0 ? (
        <Card variant="flat">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>{data.items.length ? t("admin.inbox.emptyFiltered") : t("admin.inbox.empty")}</EmptyTitle>
              {!data.items.length && <EmptyDescription>{t("admin.inbox.emptyHint")}</EmptyDescription>}
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <Card variant="flat" className="gap-0 overflow-hidden py-0">
          <ul className="divide-y divide-border">
            {items.map((r) => {
              const line = firstLine(r.message);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => show(r)}
                    aria-label={t("admin.inbox.open", { text: line })}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <FeedbackTypePill type={r.type} />
                        <FeedbackStatusPill status={r.status} />
                        {r.hasScreenshot && (
                          <ImageIcon className="size-4 text-muted-foreground" aria-label={t("admin.inbox.withScreenshot")} role="img" />
                        )}
                      </div>
                      {/* User text: plain text only, isolated so bidi characters can't reorder the row. */}
                      <bdi className="block truncate font-bold">{line}</bdi>
                      <div className="truncate text-xs text-muted-foreground">
                        <bdi>{r.reporter?.name ?? t("admin.inbox.deletedUser")}</bdi> · {ago(r.createdAt)}
                      </div>
                    </div>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <FeedbackDetail row={selected} repo={data.repo} open={open && !!selected} onOpenChange={setOpen} />
    </>
  );
}
