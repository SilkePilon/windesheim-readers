import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, Headphones, MoreVertical, Play, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { daysToExam, examDateMs, examDateYmd } from "@shared/reader-session";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Notice } from "@/components/notice";
import { AudioPill } from "@/components/admin/status-pill";
import { ConceptMapEditor } from "@/components/admin/concept-map-editor";
import { api, ApiError } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import { notify } from "@/lib/notify";
import type { AdminLessonRow, AudioStatus } from "@/lib/types";

type Episode = { week: number; status: AudioStatus; title: string | null; stale: boolean; durationSec: number; error: string | null; running: boolean };
const episodeBusy = (e: Episode) => e.running || e.status === "pending" || e.status === "generating";

/**
 * The admin reader page's "Leren" tab: exam date, weekly episodes and the concept map.
 * Loaded lazily; kept mounted (hidden) once opened so concept-map edits survive a tab switch.
 */
export default function ReaderLearnTab({
  readerId,
  examDate,
  lessons,
  active,
  onExamDateSaved,
  onDirtyChange,
}: {
  readerId: string;
  examDate: number | null;
  lessons: AdminLessonRow[];
  active: boolean;
  onExamDateSaved: () => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ExamDateCard readerId={readerId} examDate={examDate} onSaved={onExamDateSaved} />
      <EpisodesCard readerId={readerId} active={active} />
      <ConceptMapEditor readerId={readerId} lessons={lessons} active={active} onDirtyChange={onDirtyChange} />
    </div>
  );
}

function ExamDateCard({ readerId, examDate, onSaved }: { readerId: string; examDate: number | null; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const saved = examDate != null ? examDateYmd(examDate) : "";
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(saved), [saved]);

  const ms = value ? examDateMs(value) : null;
  const invalid = ms !== null && Number.isNaN(ms);
  const changed = value !== saved;

  const patch = async (next: number | null) => {
    setSaving(true);
    try {
      await api.patch(`/admin/readers/${readerId}`, { examDate: next });
      await onSaved();
      notify.success(t("common.saved"));
    } catch (e) {
      notify.error(errorText(e, t));
    } finally {
      setSaving(false);
    }
  };

  const days = daysToExam(Date.now(), examDate);
  const status =
    days === null
      ? t("admin.learn.exam.none")
      : days < 0
        ? t("admin.learn.exam.past")
        : days === 0
          ? t("admin.learn.exam.today")
          : t("admin.learn.exam.inDays", { count: days });

  return (
    <Card variant="flat" className="gap-0 py-0">
      <div className="border-b px-4 py-3">
        <h3 className="flex items-center gap-2 font-heading text-base font-semibold">
          <CalendarDays className="size-4 text-primary" aria-hidden /> {t("admin.learn.exam.heading")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("admin.learn.exam.hint")}</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed && !invalid) void patch(ms);
        }}
      >
        <div className="grid gap-1.5">
          <label htmlFor="exam-date" className="text-sm font-bold">
            {t("admin.learn.exam.label")}
          </label>
          <Input
            id="exam-date"
            type="date"
            value={value}
            min="2000-01-01"
            max="2100-12-31"
            disabled={saving}
            aria-invalid={invalid || undefined}
            aria-describedby="exam-date-status"
            onChange={(e) => setValue(e.target.value)}
            className="w-44"
          />
        </div>
        {changed && (
          <Button type="submit" variant="chunky" disabled={saving || invalid}>
            {saving && <Spinner />} {t("common.save")}
          </Button>
        )}
        {examDate != null && (
          <Button type="button" variant="flat" disabled={saving} onClick={() => void patch(null)}>
            <X /> {t("admin.learn.exam.clear")}
          </Button>
        )}
        <p id="exam-date-status" className="basis-full text-xs font-bold text-muted-foreground">
          {invalid ? t("admin.learn.exam.invalid") : status}
        </p>
      </form>
    </Card>
  );
}

function EpisodesCard({ readerId, active }: { readerId: string; active: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "reader", readerId, "episodes"],
    queryFn: () => api.get<Episode[]>(`/admin/readers/${readerId}/episodes`),
    // Poll while an episode is being made, like the structure table's audio column.
    refetchInterval: (q) => (active && q.state.data?.some(episodeBusy) ? 2500 : false),
  });
  const [queueing, setQueueing] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const generateAll = async () => {
    setQueueing(true);
    try {
      const { queued } = await api.post<{ queued: number }>(`/admin/readers/${readerId}/episodes`);
      if (queued) notify.success(t("admin.learn.episodes.queued", { count: queued }));
      else notify.info(t("admin.learn.episodes.nothingToDo"));
      await refetch();
    } catch (e) {
      notify.error(errorText(e, t));
    } finally {
      setQueueing(false);
    }
  };
  const generateOne = async (week: number) => {
    try {
      await api.post(`/admin/readers/${readerId}/episodes/${week}`);
      notify.success(t("admin.learn.episodes.queued", { count: 1 }));
      await refetch();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      notify.error(code === "ALREADY_RUNNING" ? t("admin.learn.episodes.alreadyRunning") : errorText(e, t));
    }
  };
  const remove = async (week: number) => {
    try {
      await api.del(`/admin/readers/${readerId}/episodes/${week}`);
      notify.success(t("admin.learn.episodes.deleted"));
      await refetch();
    } catch (e) {
      notify.error(errorText(e, t));
    }
  };

  const episodes = data ?? [];

  return (
    <Card variant="flat" className="gap-0 py-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="flex items-center gap-2 font-heading text-base font-semibold">
            <Headphones className="size-4 text-primary" aria-hidden /> {t("admin.learn.episodes.heading")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("admin.learn.episodes.hint")}</p>
        </div>
        <Button variant="flat" onClick={generateAll} disabled={queueing || !episodes.length}>
          {queueing ? <Spinner /> : <Sparkles />} {t("admin.learn.episodes.generateAll")}
        </Button>
      </div>
      {isLoading ? (
        <div className="px-4 py-6">
          <Spinner className="mx-auto" />
        </div>
      ) : isError ? (
        <div className="px-4 py-4">
          <Notice variant="flat" tone="danger" title={t("admin.learn.episodes.loadFailed")} />
        </div>
      ) : !episodes.length ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("admin.learn.episodes.none")}</p>
      ) : (
        <Table className="min-w-[520px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20 text-xs font-bold text-muted-foreground">{t("admin.learn.episodes.week")}</TableHead>
              <TableHead className="text-xs font-bold text-muted-foreground">{t("admin.learn.episodes.title")}</TableHead>
              <TableHead className="w-32 text-xs font-bold text-muted-foreground">{t("admin.learn.episodes.status")}</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {episodes.map((e) => {
              const busy = episodeBusy(e);
              const playable = e.durationSec > 0;
              return (
                <TableRow key={e.week}>
                  <TableCell className="font-bold tabular-nums">{e.week}</TableCell>
                  <TableCell className="truncate" title={e.title ?? undefined}>
                    {e.title ?? <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <AudioPill
                      audio={{
                        status: busy && e.status !== "generating" ? "pending" : e.status,
                        stale: e.stale,
                        chapters: playable ? 1 : 0,
                        totalMs: e.durationSec * 1000,
                        error: e.error,
                        generatedAt: null,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {playable && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/reader/${readerId}/episode/${e.week}`}>
                            <Play /> {t("admin.learn.episodes.play")}
                          </Link>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t("admin.more")}>
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={busy} onClick={() => void generateOne(e.week)}>
                            {e.status === "none" ? <Sparkles /> : <RotateCw />}{" "}
                            {e.status === "none" ? t("admin.learn.episodes.generate") : t("admin.learn.episodes.regenerate")}
                          </DropdownMenuItem>
                          {e.status !== "none" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setDeleting(e.week)}>
                                <Trash2 /> {t("admin.learn.episodes.delete")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.learn.episodes.deleteTitle", { week: deleting ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.learn.episodes.deleteText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting !== null) void remove(deleting);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
