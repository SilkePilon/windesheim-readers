import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileUp, RotateCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PageSpinner } from "@/components/page";
import { StatusPill, canRetry, readerPillState } from "@/components/admin/status-pill";
import { AdminActions } from "@/pages/admin/layout";
import { useRetryReader } from "@/components/admin/use-retry-reader";
import { api } from "@/lib/api";
import type { AdminReader } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUSY = ["extracting", "structuring", "generating"];

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const stripPdf = (name: string) => name.replace(/\.pdf$/i, "");

function UploadDialog({
  open,
  onOpenChange,
  file,
  onFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The title follows the file name until the admin types their own.
  const autoTitle = useRef("");

  useEffect(() => {
    if (!file) return;
    setTitle((cur) => {
      if (cur && cur !== autoTitle.current) return cur;
      autoTitle.current = stripPdf(file.name);
      return autoTitle.current;
    });
  }, [file]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", title);
      fd.set("course", course);
      const { id } = await api.post<{ id: string }>("/admin/readers", fd);
      onOpenChange(false);
      onFile(null);
      setTitle("");
      setCourse("");
      navigate(`/admin/readers/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("admin.uploadTitle")}</DialogTitle>
            <DialogDescription>{t("admin.uploadHint")}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-6">
            <Field>
              <FieldLabel htmlFor="file">{t("admin.file")}</FieldLabel>
              <label
                htmlFor="file"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50"
              >
                <FileUp className="size-6" />
                {file ? <span className="font-bold break-all text-foreground">{file.name}</span> : "PDF"}
              </label>
              <input
                id="file"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="title">{t("admin.readerTitle")}</FieldLabel>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="course">{t("admin.course")}</FieldLabel>
              <Input id="course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Organisatieprocessen BC1" />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" variant="chunky" disabled={!file || busy}>
              {busy ? <Spinner /> : <Upload />} {busy ? t("admin.uploading") : t("admin.upload")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReaderCard({ r, onRetry, retrying }: { r: AdminReader; onRetry: () => void; retrying: boolean }) {
  const { t } = useTranslation();
  const state = readerPillState(r);
  const pct = r.lessonCount ? Math.round((r.readyCount / r.lessonCount) * 100) : 0;

  return (
    <Card variant="flat" className="relative h-full gap-0 p-4 transition-shadow hover:ring-primary/50">
      <div>
        <StatusPill reader={r} />
      </div>
      <h3 className="mt-2.5 font-heading text-base leading-snug font-semibold">
        {/* Stretched link: the whole card opens the reader; buttons sit above it. */}
        <Link to={`/admin/readers/${r.id}`} className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
          {r.title}
        </Link>
      </h3>
      <p className="truncate text-muted-foreground">{r.course ?? r.fileName}</p>

      {state === "generating" && (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={r.lessonCount}
            aria-valuenow={r.readyCount}
            aria-label={t("admin.progress", { ready: r.readyCount, total: r.lessonCount })}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-track"
          >
            <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("admin.progress", { ready: r.readyCount, total: r.lessonCount })}</p>
        </>
      )}

      {(state === "error" || state === "partial") && (
        <p className="mt-2 line-clamp-2 text-xs text-danger-shade dark:text-danger">
          {state === "partial" && r.failedCount > 0 ? t("admin.failedLessons", { count: r.failedCount }) : r.error}
        </p>
      )}

      {state === "review" ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("admin.proposed", { count: r.lessonCount })}</p>
      ) : (
        state !== "generating" && (
          <p className="mt-2 flex gap-3 text-xs text-muted-foreground">
            {r.lessonCount > 0 && <span>{t("admin.lessonCount", { count: r.lessonCount })}</span>}
            {r.pageCount > 0 && <span>{t("admin.pagesN", { n: r.pageCount })}</span>}
          </p>
        )
      )}

      {(state === "review" || canRetry(r)) && (
        <div className="relative z-10 mt-auto pt-3">
          {state === "review" ? (
            <Button variant="flat" asChild>
              <Link to={`/admin/readers/${r.id}`}>{t("admin.reviewStructure")}</Link>
            </Button>
          ) : (
            <Button variant="flat" onClick={onRetry} disabled={retrying}>
              {retrying ? <Spinner /> : <RotateCw />} {t("admin.retry")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/** Window-level PDF drop: dragging a file anywhere on the page shows an overlay. */
function usePageDrop(onDrop: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const cb = useRef(onDrop);
  cb.current = onDrop;

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // allow the drop (and stop the browser opening the PDF)
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) cb.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return dragging;
}

export default function AdminReadersPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { retry, pending } = useRetryReader();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "readers"],
    queryFn: () => api.get<AdminReader[]>("/admin/readers"),
    refetchInterval: (q) => (q.state.data?.some((r) => BUSY.includes(r.status)) ? 3000 : false),
  });

  const dragging = usePageDrop((files) => {
    // One reader per upload: take the first PDF and say so when more were dropped.
    const f = files.find(isPdf);
    if (!f) {
      toast.error(t("admin.dropNotPdf"));
      return;
    }
    if (files.length > 1) toast.info(t("admin.dropOnlyOne", { name: f.name }));
    setFile(f);
    setOpen(true);
  });

  return (
    <>
      <AdminActions>
        <Button variant="chunky" onClick={() => setOpen(true)}>
          <Upload /> {t("admin.upload")}
        </Button>
      </AdminActions>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((r) => (
            <ReaderCard key={r.id} r={r} onRetry={() => retry(r.id)} retrying={pending === r.id} />
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "grid min-h-36 place-items-center rounded-lg border-2 border-dashed border-input p-4 text-center text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              !data?.length && "col-span-full min-h-56",
              data && data.length % 3 === 1 && "lg:col-span-2",
            )}
          >
            <span className="flex flex-col items-center gap-1.5">
              <Upload className="size-6" />
              <span className="font-bold">{data?.length ? t("admin.dropHint") : t("admin.noReaders")}</span>
              <span className="text-xs">{data?.length ? t("admin.dropOrClick") : t("admin.dropHint")}</span>
            </span>
          </button>
        </div>
      )}

      <UploadDialog open={open} onOpenChange={setOpen} file={file} onFile={setFile} />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-background/70 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center font-heading text-lg font-semibold text-primary">
            <FileUp className="size-8" />
            {t("admin.dropRelease")}
          </div>
        </div>
      )}
    </>
  );
}
