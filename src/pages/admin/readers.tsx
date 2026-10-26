import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileUp, Library, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Page, PageHeader, PageSpinner } from "@/components/page";
import { ReaderStatusBadge } from "@/components/admin-status";
import { api } from "@/lib/api";
import type { AdminReader } from "@/lib/types";

function UploadDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setOpen(false);
      navigate(`/admin/readers/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> {t("admin.upload")}
        </Button>
      </DialogTrigger>
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
                {file ? <span className="font-medium text-foreground">{file.name}</span> : "PDF"}
              </label>
              <input
                id="file"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ""));
                }}
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
            <Button type="submit" disabled={!file || busy}>
              {busy && <Spinner />} {busy ? t("admin.uploading") : t("admin.upload")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminReadersPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "readers"],
    queryFn: () => api.get<AdminReader[]>("/admin/readers"),
    refetchInterval: (q) => (q.state.data?.some((r) => ["extracting", "structuring", "generating"].includes(r.status)) ? 3000 : false),
  });
  if (isLoading) return <PageSpinner />;

  return (
    <Page wide>
      <PageHeader title={t("admin.readers")} actions={<UploadDialog />} />
      {!data?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Library />
            </EmptyMedia>
            <EmptyTitle>{t("admin.noReaders")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((r) => (
            <Link key={r.id} to={`/admin/readers/${r.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.title}</div>
                      <div className="truncate text-sm text-muted-foreground">{r.course ?? r.fileName}</div>
                    </div>
                    {r.published && <Badge>{t("admin.published")}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <ReaderStatusBadge status={r.status} />
                    <span>{r.pageCount} p.</span>
                    <span>
                      {r.readyCount}/{r.lessonCount} {t("learn.lessons").toLowerCase()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
