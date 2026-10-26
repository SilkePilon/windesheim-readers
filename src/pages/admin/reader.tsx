import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, FileText, MoreVertical, Pencil, Plus, RefreshCw, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
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
import { Page, PageHeader, PageSpinner } from "@/components/page";
import { ReaderStatusBadge } from "@/components/admin-status";
import { api } from "@/lib/api";
import type { AdminLessonRow, AdminReader } from "@/lib/types";

type Detail = AdminReader & { lessons: AdminLessonRow[] };
type Row = { id?: string; key: string; code: string; title: string; week: number; startPage: number; endPage: number };

const BUSY = ["extracting", "structuring", "generating"];
let keySeq = 0;

function toRows(lessons: AdminLessonRow[]): Row[] {
  return lessons.map((l) => ({ id: l.id, key: l.id, code: l.code, title: l.title, week: l.week, startPage: l.startPage, endPage: l.endPage }));
}

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
          <SheetTitle>{t("admin.previewPage")} {p}</SheetTitle>
          <SheetDescription className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setP((x) => Math.max(1, x - 1))}>
              ←
            </Button>
            <Button size="sm" variant="outline" onClick={() => setP((x) => x + 1)}>
              →
            </Button>
          </SheetDescription>
        </SheetHeader>
        <pre className="flex-1 overflow-y-auto px-4 pb-4 font-sans text-sm whitespace-pre-wrap">{data?.text}</pre>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminReaderPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "reader", id],
    queryFn: () => api.get<Detail>(`/admin/readers/${id}`),
    refetchInterval: (q) => (q.state.data && BUSY.includes(q.state.data.status) ? 2500 : false),
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  // Sync from server unless the admin is editing.
  useEffect(() => {
    if (data && !dirty) setRows(toRows(data.lessons));
  }, [data, dirty]);

  const lessonById = useMemo(() => new Map(data?.lessons.map((l) => [l.id, l]) ?? []), [data]);

  if (isLoading || !data) return <PageSpinner />;
  const busy = BUSY.includes(data.status);

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const remove = (key: string) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
  };
  const addAfter = (key?: string) => {
    setRows((rs) => {
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
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/readers/${id}/lessons`, rows.map(({ id: lid, code, title, week, startPage, endPage }) => ({ id: lid, code, title, week, startPage, endPage })));
      setDirty(false);
      await refetch();
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const generate = async (lessonIds?: string[]) => {
    await api.post(`/admin/readers/${id}/generate`, { lessonIds });
    await refetch();
  };

  const patchReader = async (body: Record<string, unknown>) => {
    await api.patch(`/admin/readers/${id}`, body);
    await refetch();
    void qc.invalidateQueries({ queryKey: ["readers"] });
  };

  const missing = data.lessons.filter((l) => l.status !== "ready").map((l) => l.id);
  const valid = rows.every((r) => r.code.trim() && r.title.trim() && r.startPage >= 1 && r.endPage >= r.startPage);

  return (
    <Page wide>
      <PageHeader
        back="/admin"
        title={data.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ReaderStatusBadge status={data.status} />
            <span>{data.pageCount} p.</span>
            {data.course && <span>· {data.course}</span>}
          </span>
        }
        actions={
          <>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <Switch id="pub" checked={data.published} onCheckedChange={(v) => patchReader({ published: v })} />
              <Label htmlFor="pub">{t("admin.published")}</Label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/admin/readers/${id}/pdf`} target="_blank" rel="noreferrer">
                    <FileText /> {t("admin.viewPdf")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreview(1)}>
                  <Eye /> {t("admin.previewPage")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm(t("admin.reStructureConfirm"))) return;
                    setDirty(false);
                    await api.post(`/admin/readers/${id}/restructure`);
                    await refetch();
                  }}
                >
                  <Wand2 /> {t("admin.reStructure")}
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
                          void qc.invalidateQueries({ queryKey: ["readers"] });
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
          </>
        }
      />

      {busy && (
        <Alert className="mb-4">
          <Spinner />
          <AlertTitle>{t(`admin.status.${data.status}`)}</AlertTitle>
          {data.status === "generating" && (
            <AlertDescription>
              {data.lessons.filter((l) => l.status === "ready").length} / {data.lessons.length}
            </AlertDescription>
          )}
        </Alert>
      )}
      {data.error && !busy && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{t("admin.status.error")}</AlertTitle>
          <AlertDescription className="break-all">{data.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.structure")}</CardTitle>
          <CardDescription>{t("admin.structureHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Desktop column headers */}
          <div className="hidden grid-cols-[5.5rem_1fr_4rem_4.5rem_4.5rem_9rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
            <span>{t("admin.code")}</span>
            <span>{t("admin.lessonTitle")}</span>
            <span>{t("admin.weekCol")}</span>
            <span>{t("admin.from")}</span>
            <span>{t("admin.to")}</span>
            <span>{t("admin.content")}</span>
            <span />
          </div>
          {rows.map((r) => {
            const l = r.id ? lessonById.get(r.id) : undefined;
            return (
              <div
                key={r.key}
                className="grid grid-cols-[5rem_1fr_2.5rem] gap-2 rounded-xl border p-2 md:grid-cols-[5.5rem_1fr_4rem_4.5rem_4.5rem_9rem_2.5rem] md:items-center md:border-0 md:p-0"
              >
                <Input value={r.code} onChange={(e) => update(r.key, { code: e.target.value })} className="font-mono" placeholder="1.2A" />
                <Input value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:order-last">
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {l && (
                      <DropdownMenuItem asChild>
                        <Link to={`/admin/lessons/${l.id}`}>
                          <Pencil /> {t("admin.lessonEditor")}
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {l && (
                      <DropdownMenuItem disabled={busy || dirty} onClick={() => generate([l.id])}>
                        <RefreshCw /> {t("admin.regenerate")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setPreview(r.startPage)}>
                      <Eye /> {t("admin.previewPage")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addAfter(r.key)}>
                      <Plus /> {t("admin.addLesson")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => remove(r.key)}>
                      <Trash2 /> {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="col-span-3 grid grid-cols-3 gap-2 md:contents">
                  <Input type="number" min={1} value={r.week} onChange={(e) => update(r.key, { week: Number(e.target.value) })} aria-label={t("admin.weekCol")} />
                  <Input type="number" min={1} max={data.pageCount} value={r.startPage} onChange={(e) => update(r.key, { startPage: Number(e.target.value) })} aria-label={t("admin.from")} />
                  <Input type="number" min={1} max={data.pageCount} value={r.endPage} onChange={(e) => update(r.key, { endPage: Number(e.target.value) })} aria-label={t("admin.to")} />
                </div>
                <div className="col-span-3 flex items-center gap-2 text-xs text-muted-foreground md:col-span-1">
                  {l ? (
                    <>
                      <ReaderStatusBadge status={l.status} />
                      {l.status === "ready" && (
                        <span title={`${t("admin.cardsN", { n: l.flashcards })}, ${t("admin.questionsN", { n: l.questions })}`}>
                          {l.flashcards}🃏 {l.questions}❓
                        </span>
                      )}
                      {l.status === "error" && <span className="truncate text-destructive" title={l.error ?? ""}>{l.error}</span>}
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2 pt-3">
            <Button variant="outline" onClick={() => addAfter()} disabled={busy}>
              <Plus /> {t("admin.addLesson")}
            </Button>
            <div className="flex-1" />
            {dirty && <span className="self-center text-sm text-amber-600">{t("admin.unsaved")}</span>}
            <Button variant="outline" onClick={save} disabled={!dirty || saving || !valid || busy}>
              {saving ? <Spinner /> : <Save />} {t("admin.saveStructure")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("admin.content")}</CardTitle>
          <CardDescription>{t("admin.generateHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {missing.length > 0 && missing.length < data.lessons.length && (
            <Button onClick={() => generate(missing)} disabled={busy || dirty}>
              <Sparkles /> {t("admin.generateMissing")} ({missing.length})
            </Button>
          )}
          <Button variant={missing.length && missing.length < data.lessons.length ? "outline" : "default"} onClick={() => generate()} disabled={busy || dirty || !rows.length}>
            <Sparkles /> {t("admin.generateAll")}
          </Button>
        </CardContent>
      </Card>

      <PagePreview readerId={id} page={preview} onClose={() => setPreview(null)} />
    </Page>
  );
}
