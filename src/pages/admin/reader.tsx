import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { notify } from "@/lib/notify";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  Eye,
  FileText,
  GripVertical,
  Headphones,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Notice } from "@/components/notice";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageSpinner } from "@/components/page";
import { AudioPill, LessonPill, StatusPill, audioBusy, canRetry } from "@/components/admin/status-pill";
import { SaveBar } from "@/components/admin/save-bar";
import { useRetryReader } from "@/components/admin/use-retry-reader";
import { api, ApiError } from "@/lib/api";
import type { AdminLessonRow, AdminReader } from "@/lib/types";
import { cn } from "@/lib/utils";

// The detail endpoint has no counts; they are derived from `lessons`.
type Detail = Omit<AdminReader, "lessonCount" | "readyCount" | "failedCount"> & { lessons: AdminLessonRow[] };
type Row = { id?: string; key: string; code: string; title: string; week: number; startPage: number; endPage: number };

const BUSY = ["extracting", "structuring", "generating"];
const audioRunning = (d: Detail) => d.lessons.some((l) => audioBusy(l.audio));
/** Lessons "Genereer audio" (missing only) would queue; mirrors queueReaderAudio on the server. */
const audioMissing = (d: Detail) =>
  d.lessons.filter((l) => l.status === "ready" && !audioBusy(l.audio) && (l.audio.chapters === 0 || l.audio.stale || l.audio.status !== "ready"));
let keySeq = 0;

function toRows(lessons: AdminLessonRow[]): Row[] {
  return lessons.map((l) => ({ id: l.id, key: l.id, code: l.code, title: l.title, week: l.week, startPage: l.startPage, endPage: l.endPage }));
}

const rowValid = (r: Row) => !!r.code.trim() && !!r.title.trim() && r.week >= 1 && r.startPage >= 1 && r.endPage >= r.startPage;

/** Rows only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function PagePreview({ readerId, page, onClose }: { readerId: string; page: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [p, setP] = useState(page ?? 1);
  useEffect(() => setP(page ?? 1), [page]);
  const { data } = useQuery({
    queryKey: ["page", readerId, p],
    queryFn: () => api.get<{ text: string }>(`/admin/readers/${readerId}/pages/${p}`),
    enabled: page !== null,
  });
  return (
    <Sheet open={page !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {t("admin.previewPage")} {p}
          </SheetTitle>
          <SheetDescription className="flex gap-2">
            <Button size="sm" variant="flat" onClick={() => setP((x) => Math.max(1, x - 1))}>
              ←
            </Button>
            <Button size="sm" variant="flat" onClick={() => setP((x) => x + 1)}>
              →
            </Button>
          </SheetDescription>
        </SheetHeader>
        <pre className="flex-1 overflow-y-auto px-4 pb-4 font-sans text-sm whitespace-pre-wrap">{data?.text}</pre>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A table cell that reads as plain text and turns into an input on click (or Enter).
 * Enter or blur commits, Escape cancels.
 */
function EditableCell({
  value,
  onCommit,
  numeric,
  label,
  placeholder,
  className,
  invalid,
}: {
  value: string | number;
  onCommit: (v: string) => void;
  numeric?: boolean;
  label: string;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);

  const start = () => {
    setDraft(String(value));
    cancelled.current = false;
    setEditing(true);
  };
  const finish = () => {
    setEditing(false);
    if (cancelled.current) return;
    const v = draft.trim();
    if (v !== String(value)) onCommit(v);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      cancelled.current = true;
      e.currentTarget.blur();
    }
  };

  if (editing)
    return (
      <Input
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        value={draft}
        inputMode={numeric ? "numeric" : undefined}
        onChange={(e) => setDraft(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
        onBlur={finish}
        onKeyDown={onKey}
        className={cn("-mx-2 h-8 w-[calc(100%+1rem)] px-2 text-sm", className)}
      />
    );
  return (
    <button
      type="button"
      onClick={start}
      aria-label={`${label}: ${value || placeholder || ""}`}
      title={value === "" ? undefined : String(value)}
      className={cn(
        "-mx-2 flex h-8 w-[calc(100%+1rem)] min-w-0 items-center rounded-md border border-transparent px-2 text-left outline-none hover:border-border hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        invalid && "border-danger/60 bg-danger/5",
        className,
      )}
    >
      <span className={cn("truncate", value === "" && "text-muted-foreground")}>{value === "" ? placeholder : value}</span>
    </button>
  );
}

function SortableRow({
  row,
  lesson,
  changed,
  busy,
  dirty,
  onChange,
  onRemove,
  onAddAfter,
  onPreview,
  onRegenerate,
  onRegenerateAudio,
}: {
  row: Row;
  lesson?: AdminLessonRow;
  changed: boolean;
  busy: boolean;
  dirty: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  onAddAfter: () => void;
  onPreview: () => void;
  onRegenerate: () => void;
  onRegenerateAudio: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const num = (v: string) => Math.max(0, Number.parseInt(v, 10) || 0);

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(changed && "bg-accent/60", isDragging && "relative z-10 bg-card shadow-[0_8px_24px_-8px_rgba(36,26,74,0.35)]")}
    >
      <TableCell className="w-9 pr-0 pl-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("admin.dragHandle", { code: row.code })}
          className="grid size-7 cursor-grab touch-none place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell className="w-24">
        <EditableCell
          value={row.code}
          label={t("admin.code")}
          placeholder="1.2A"
          invalid={!row.code.trim()}
          className="font-heading text-[15px] font-semibold text-primary"
          onCommit={(v) => onChange({ code: v })}
        />
      </TableCell>
      <TableCell className="max-w-0">
        <EditableCell
          value={row.title}
          label={t("admin.lessonTitle")}
          placeholder={t("admin.lessonTitle")}
          invalid={!row.title.trim()}
          onCommit={(v) => onChange({ title: v })}
        />
      </TableCell>
      <TableCell className="w-16">
        <EditableCell numeric value={row.week} label={t("admin.weekCol")} invalid={row.week < 1} onCommit={(v) => onChange({ week: num(v) })} />
      </TableCell>
      <TableCell className="w-32">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <div className="w-10">
            <EditableCell numeric value={row.startPage} label={t("admin.from")} invalid={row.startPage < 1} className="justify-end text-right" onCommit={(v) => onChange({ startPage: num(v) })} />
          </div>
          <span aria-hidden>–</span>
          <div className="w-10">
            <EditableCell
              numeric
              value={row.endPage}
              label={t("admin.to")}
              invalid={row.endPage < row.startPage}
              onCommit={(v) => onChange({ endPage: num(v) })}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="w-48">
        {lesson ? (
          <span title={lesson.error ?? undefined}>
            <LessonPill status={lesson.status} flashcards={lesson.flashcards} questions={lesson.questions} />
          </span>
        ) : (
          <span className="text-muted-foreground">{t("admin.newLesson")}</span>
        )}
      </TableCell>
      <TableCell className="w-32">{lesson && <AudioPill audio={lesson.audio} />}</TableCell>
      <TableCell className="w-11 pr-2 pl-0 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("admin.rowActions", { code: row.code })}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {lesson && (
              <DropdownMenuItem asChild>
                <Link to={`/admin/lessons/${lesson.id}`}>
                  <Pencil /> {t("admin.lessonEditor")}
                </Link>
              </DropdownMenuItem>
            )}
            {lesson && (
              <DropdownMenuItem disabled={busy || dirty} onClick={onRegenerate}>
                <RefreshCw /> {t("admin.regenerate")}
              </DropdownMenuItem>
            )}
            {lesson && (
              <DropdownMenuItem disabled={dirty || lesson.status !== "ready" || audioBusy(lesson.audio)} onClick={onRegenerateAudio}>
                <Headphones /> {lesson.audio.status === "none" ? t("admin.audio.generateOne") : t("admin.audio.regenerate")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onPreview}>
              <Eye /> {t("admin.previewPage")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddAfter}>
              <Plus /> {t("admin.addLesson")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2 /> {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function AdminReaderPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { retry, pending: retrying } = useRetryReader();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "reader", id],
    queryFn: () => api.get<Detail>(`/admin/readers/${id}`),
    // Poll while content or any luisterles is being made.
    refetchInterval: (q) => (q.state.data && (BUSY.includes(q.state.data.status) || audioRunning(q.state.data)) ? 2500 : false),
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [queueingAudio, setQueueingAudio] = useState(false);

  // Sync from server unless the admin is editing.
  useEffect(() => {
    if (data && !dirty) setRows(toRows(data.lessons));
  }, [data, dirty]);

  // Unsaved structure edits: guard in-app navigation (tabs, back arrow, dock, browser
  // Back) with a dialog, and reload/close with the browser's own prompt.
  // Set once the admin chose to leave (discard, or the reader was deleted). The page can
  // stay mounted briefly during the route transition, so both guards check it.
  const leaving = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const lessonById = useMemo(() => new Map(data?.lessons.map((l) => [l.id, l]) ?? []), [data]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading || !data) return <PageSpinner />;
  const busy = BUSY.includes(data.status);

  const edit = (fn: (rs: Row[]) => Row[]) => {
    setRows(fn);
    setDirty(true);
  };
  const update = (key: string, patch: Partial<Row>) => edit((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => edit((rs) => rs.filter((r) => r.key !== key));
  const addAfter = (key?: string) =>
    edit((rs) => {
      const i = key ? rs.findIndex((r) => r.key === key) : rs.length - 1;
      const prev = rs[i];
      const row: Row = {
        key: `new-${keySeq++}`,
        code: "",
        title: "",
        week: prev?.week ?? 1,
        startPage: prev?.endPage ?? 1,
        endPage: prev?.endPage ?? 1,
      };
      return [...rs.slice(0, i + 1), row, ...rs.slice(i + 1)];
    });
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    edit((rs) => arrayMove(rs, rs.findIndex((r) => r.key === active.id), rs.findIndex((r) => r.key === over.id)));
  };
  const reset = () => {
    setRows(toRows(data.lessons));
    setDirty(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(
        `/admin/readers/${id}/lessons`,
        rows.map(({ id: lid, code, title, week, startPage, endPage }) => ({ id: lid, code, title, week, startPage, endPage })),
      );
      setDirty(false);
      await refetch();
      notify.success(t("common.saved"));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const generate = async (lessonIds?: string[]) => {
    await api.post(`/admin/readers/${id}/generate`, { lessonIds });
    await refetch();
  };

  const generateAudio = async () => {
    setQueueingAudio(true);
    try {
      const { queued } = await api.post<{ queued: number }>(`/admin/readers/${id}/audio`, {});
      if (queued) notify.success(t("admin.audio.queued", { count: queued }));
      else notify.info(t("admin.audio.nothingToDo"));
      await refetch();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setQueueingAudio(false);
    }
  };
  const regenerateAudio = async (lessonId: string) => {
    try {
      await api.post(`/admin/lessons/${lessonId}/audio`);
      notify.success(t("admin.audio.queued", { count: 1 }));
      await refetch();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      notify.error(code === "ALREADY_RUNNING" ? t("admin.audio.alreadyRunning") : code === "LESSON_NOT_READY" ? t("admin.audio.lessonNotReady") : e instanceof Error ? e.message : t("common.error"));
    }
  };

  const patchReader = async (body: Record<string, unknown>) => {
    await api.patch(`/admin/readers/${id}`, body);
    await refetch();
    void qc.invalidateQueries({ queryKey: ["readers"] });
    void qc.invalidateQueries({ queryKey: ["admin", "readers"] });
  };

  const restructure = async () => {
    if (!confirm(t("admin.reStructureConfirm"))) return;
    setDirty(false);
    await api.post(`/admin/readers/${id}/restructure`);
    await refetch();
  };

  const counts = {
    lessonCount: data.lessons.length,
    readyCount: data.lessons.filter((l) => l.status === "ready").length,
    failedCount: data.lessons.filter((l) => l.status === "error").length,
  };
  const reader = { ...data, ...counts };
  const missing = data.lessons.filter((l) => l.status !== "ready").map((l) => l.id);
  const partial = missing.length > 0 && missing.length < data.lessons.length;
  const valid = rows.every(rowValid);
  const original = new Map(toRows(data.lessons).map((r, i) => [r.key, { ...r, i }]));
  const isChanged = (r: Row, i: number) => {
    const o = original.get(r.key);
    return !o || o.i !== i || o.code !== r.code || o.title !== r.title || o.week !== r.week || o.startPage !== r.startPage || o.endPage !== r.endPage;
  };
  const genDisabled = busy || dirty || !data.lessons.length;
  const audioTodo = audioMissing(data).length;
  const audioBusyCount = data.lessons.filter((l) => audioBusy(l.audio)).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="-ml-2 shrink-0">
            <Link to="/admin" aria-label={t("common.back")}>
              <ChevronLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <h2 className="font-heading text-xl leading-tight font-semibold break-words">{data.title}</h2>
            <p className="text-xs break-words text-muted-foreground">
              {[data.course, t("admin.pagesN", { n: data.pageCount })].filter(Boolean).join(" · ")}
            </p>
          </div>
          <StatusPill reader={reader} className="ml-1" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 items-center gap-2 rounded-lg border bg-card px-3">
            <Label htmlFor="pub" className="text-sm font-bold">
              {t("admin.published")}
            </Label>
            <Switch id="pub" checked={data.published} onCheckedChange={(v) => patchReader({ published: v })} />
          </div>
          <Button variant="flat" asChild>
            <a href={`/api/admin/readers/${id}/pdf`} target="_blank" rel="noreferrer">
              <FileText /> PDF
            </a>
          </Button>
          {canRetry(reader) && (
            <Button variant="flat" onClick={() => retry(id)} disabled={retrying === id}>
              {retrying === id ? <Spinner /> : <RotateCw />} {t("admin.retry")}
            </Button>
          )}
          <Button variant="chunky" onClick={() => generate(partial ? missing : undefined)} disabled={genDisabled} title={dirty ? t("admin.saveFirst") : undefined}>
            <Sparkles /> {partial ? `${t("admin.generateMissing")} (${missing.length})` : t("admin.generateAll")}
          </Button>
          <Button
            variant="flat"
            onClick={generateAudio}
            disabled={dirty || queueingAudio || !audioTodo}
            title={dirty ? t("admin.saveFirst") : !audioTodo ? t("admin.audio.allDone") : t("admin.audio.generateHint")}
          >
            {queueingAudio ? <Spinner /> : <Headphones />} {t("admin.audio.generate")}
            {audioTodo > 0 && <span className="text-muted-foreground tabular-nums">({audioTodo})</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="flat" size="icon" aria-label={t("admin.more")}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {partial && (
                <DropdownMenuItem disabled={genDisabled} onClick={() => generate()}>
                  <Sparkles /> {t("admin.generateAll")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setPreview(1)}>
                <Eye /> {t("admin.previewPage")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 /> {t("admin.deleteReader")}
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("admin.deleteReader")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("admin.deleteConfirm")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={async () => {
                        await api.del(`/admin/readers/${id}`);
                        leaving.current = true;
                        void qc.invalidateQueries({ queryKey: ["readers"] });
                        void qc.invalidateQueries({ queryKey: ["admin", "readers"] });
                        navigate("/admin");
                      }}
                    >
                      {t("common.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {busy && (
        <Alert className="mb-4">
          <Spinner />
          <AlertTitle>{t(`admin.status.${data.status}`)}</AlertTitle>
          {data.status === "generating" && (
            <AlertDescription>{t("admin.progress", { ready: counts.readyCount, total: counts.lessonCount })}</AlertDescription>
          )}
        </Alert>
      )}
      {audioBusyCount > 0 && !busy && (
        <Alert className="mb-4">
          <Spinner />
          <AlertTitle>{t("admin.audio.running")}</AlertTitle>
          <AlertDescription>{t("admin.audio.runningHint", { count: audioBusyCount })}</AlertDescription>
        </Alert>
      )}
      {data.error && !busy && (
        <Notice
          variant="flat"
          tone={data.status === "error" ? "danger" : "warning"}
          title={t(data.status === "error" ? "admin.pill.error" : "admin.pill.partial")}
          description={<span className="break-all">{data.error}</span>}
          className="mb-4"
        />
      )}

      <Card variant="flat" className="gap-0 py-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3">
          <h3 className="font-heading text-base font-semibold">{t("admin.structure")}</h3>
          <p className="text-xs text-muted-foreground">{t("admin.structureHint")}</p>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={onDragEnd}>
          <Table className="min-w-[848px] table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-9" />
                <TableHead className="w-24 text-xs font-bold text-muted-foreground">{t("admin.code")}</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">{t("admin.lessonTitle")}</TableHead>
                <TableHead className="w-16 text-xs font-bold text-muted-foreground">{t("admin.weekCol")}</TableHead>
                <TableHead className="w-32 text-xs font-bold text-muted-foreground">{t("admin.pages")}</TableHead>
                <TableHead className="w-48 text-xs font-bold text-muted-foreground">{t("admin.content")}</TableHead>
                <TableHead className="w-32 text-xs font-bold text-muted-foreground">{t("admin.audio.column")}</TableHead>
                <TableHead className="w-11" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                {rows.map((r, i) => (
                  <SortableRow
                    key={r.key}
                    row={r}
                    lesson={r.id ? lessonById.get(r.id) : undefined}
                    changed={dirty && isChanged(r, i)}
                    busy={busy}
                    dirty={dirty}
                    onChange={(patch) => update(r.key, patch)}
                    onRemove={() => remove(r.key)}
                    onAddAfter={() => addAfter(r.key)}
                    onPreview={() => setPreview(r.startPage)}
                    onRegenerate={() => generate([r.id!])}
                    onRegenerateAudio={() => regenerateAudio(r.id!)}
                  />
                ))}
              </SortableContext>
              {!rows.length && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t("admin.noLessons")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DndContext>
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <Button variant="flat" onClick={() => addAfter()} disabled={busy}>
            <Plus /> {t("admin.addLesson")}
          </Button>
          <Button variant="flat" onClick={restructure} disabled={busy}>
            <Wand2 /> {t("admin.reStructure")}
          </Button>
          <p className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">{t("admin.generateHint")}</p>
        </div>
      </Card>

      {/* Room for the save bar so it never covers the last row. */}
      {dirty && <div aria-hidden className="h-20" />}
      <SaveBar dirty={dirty} saving={saving} canSave={valid && !busy} hint={valid ? undefined : t("admin.invalidRows")} onSave={save} onReset={reset} />
      <PagePreview readerId={id} page={preview} onClose={() => setPreview(null)} />
      <AlertDialog open={blocker.state === "blocked"} onOpenChange={(o) => !o && blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.leaveText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>{t("admin.leaveStay")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                leaving.current = true;
                blocker.proceed?.();
              }}
            >
              {t("admin.leaveDiscard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
