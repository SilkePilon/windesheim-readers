import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link2, Network, Plus, Sparkles, Trash2, X } from "lucide-react";
import { CONCEPT_LIMITS, type Concept, type ConceptMapData } from "@shared/concept-map";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CharCounter } from "@/components/char-counter";
import { Notice } from "@/components/notice";
import { Pill } from "@/components/admin/status-pill";
import { SaveBar } from "@/components/admin/save-bar";
import { api, ApiError } from "@/lib/api";
import { addConcept, addLink, draftIssue, removeConcept, removeLink, updateConcept, updateLink } from "@/lib/concept-edit";
import { errorText } from "@/lib/error-text";
import { notify } from "@/lib/notify";
import { qk } from "@/lib/queries";
import type { AdminLessonRow } from "@/lib/types";

// The student view, as the read-only preview of the saved map.
const ReaderConceptMap = lazy(() => import("@/components/reader-learn/concept-map"));

type MapRow = { status: "pending" | "generating" | "ready" | "error"; error: string | null; data: ConceptMapData | null; editedAt: string | null; updatedAt: string | null };
const EMPTY: ConceptMapData = { concepts: [], links: [] };
const running = (m: MapRow | null | undefined) => m?.status === "pending" || m?.status === "generating";

export const conceptMapKey = (readerId: string) => ["admin", "reader", readerId, "concept-map"] as const;

/**
 * "Conceptkaart" admin: status and (re)generate, a list editor for concepts and their outgoing
 * links, the save bar and a preview through the student view. The draft is checked with the
 * server's own rules against the reader's current lessons before saving, so a concept whose
 * lesson was removed by a restructure is flagged instead of failing on the server.
 */
export function ConceptMapEditor({
  readerId,
  lessons,
  active,
  onDirtyChange,
}: {
  readerId: string;
  lessons: AdminLessonRow[];
  /** The tab is visible: polls and shows the save bar only then. */
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: map, isLoading, refetch } = useQuery({
    queryKey: conceptMapKey(readerId),
    queryFn: () => api.get<MapRow | null>(`/admin/readers/${readerId}/concept-map`),
    refetchInterval: (q) => (active && running(q.state.data) ? 2500 : false),
  });

  const [draft, setDraft] = useState<ConceptMapData>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Sync from the server unless the admin is editing.
  useEffect(() => {
    if (!dirty) setDraft(map?.data ?? EMPTY);
  }, [map, dirty]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // When a generation finishes, the student preview has new data.
  const busy = running(map);
  useEffect(() => {
    if (!busy) void qc.invalidateQueries({ queryKey: qk.conceptMap(readerId) });
  }, [busy, qc, readerId]);

  const lessonIds = useMemo(() => new Set(lessons.map((l) => l.id)), [lessons]);
  const issue = draftIssue(draft, lessonIds);

  const edit = (fn: (d: ConceptMapData) => ConceptMapData) => {
    setDraft(fn);
    setDirty(true);
    setServerError(null);
  };
  const reset = () => {
    setDraft(map?.data ?? EMPTY);
    setDirty(false);
    setServerError(null);
  };

  const save = async () => {
    setSaving(true);
    setServerError(null);
    try {
      const saved = await api.put<MapRow>(`/admin/readers/${readerId}/concept-map`, { data: draft });
      qc.setQueryData(conceptMapKey(readerId), saved);
      setDirty(false);
      void qc.invalidateQueries({ queryKey: qk.conceptMap(readerId) });
      notify.success(t("common.saved"));
    } catch (e) {
      if (e instanceof ApiError && e.status !== 429 && e.code in ISSUE_CODES) setServerError(e.code);
      else notify.error(errorText(e, t));
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setStarting(true);
    try {
      await api.post(`/admin/readers/${readerId}/concept-map`);
      setDirty(false);
      setServerError(null);
      await refetch();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      notify.error(
        code === "NO_READY_LESSONS" ? t("admin.learn.map.noReadyLessons") : code === "ALREADY_RUNNING" ? t("admin.learn.map.alreadyRunning") : errorText(e, t),
      );
    } finally {
      setStarting(false);
    }
  };
  // Regenerating replaces manual edits (saved or not): ask first.
  const onGenerate = () => (map?.editedAt || dirty ? setConfirming(true) : void generate());

  const hasMap = !!map?.data;
  const firstLesson = lessons[0]?.id ?? "";
  const savedHasConcepts = (map?.data?.concepts.length ?? 0) > 0;

  return (
    <Card variant="flat" className="gap-0 py-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="flex items-center gap-2 font-heading text-base font-semibold">
            <Network className="size-4 text-primary" aria-hidden /> {t("admin.learn.map.heading")}
            {map?.editedAt && <Pill tone="track">{t("admin.learn.map.edited")}</Pill>}
          </h3>
          <p className="text-xs text-muted-foreground">{t("admin.learn.map.hint")}</p>
        </div>
        <Button variant="flat" onClick={onGenerate} disabled={busy || starting || isLoading}>
          {busy || starting ? <Spinner /> : <Sparkles />} {hasMap ? t("admin.learn.map.regenerate") : t("admin.learn.map.generate")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        {isLoading ? (
          <Spinner className="mx-auto" />
        ) : (
          <>
            {busy && (
              <Alert>
                <Spinner />
                <AlertTitle>{t("admin.learn.map.generating")}</AlertTitle>
                <AlertDescription>{t("admin.learn.map.generatingHint")}</AlertDescription>
              </Alert>
            )}
            {map?.status === "error" && !busy && (
              <Notice variant="flat" tone="danger" title={t("admin.learn.map.failed")} description={map.error && <span className="break-all">{map.error}</span>} />
            )}
            {serverError && (
              <Notice
                variant="flat"
                tone="danger"
                title={t("admin.learn.map.saveFailed")}
                description={
                  <>
                    {t(`admin.learn.map.issue.${serverError}`)} <code className="text-xs">({serverError})</code>
                  </>
                }
              />
            )}
            {!draft.concepts.length && !busy && <p className="text-sm text-muted-foreground">{t("admin.learn.map.none")}</p>}

            {draft.concepts.length > 0 && (
              <p className="text-xs font-bold text-muted-foreground tabular-nums">
                {t("admin.learn.map.counts", {
                  concepts: draft.concepts.length,
                  maxConcepts: CONCEPT_LIMITS.concepts,
                  links: draft.links.length,
                  maxLinks: CONCEPT_LIMITS.links,
                })}
              </p>
            )}

            <ol className="flex flex-col gap-3">
              {draft.concepts.map((c, i) => (
                <ConceptRow
                  key={c.id}
                  n={i + 1}
                  concept={c}
                  draft={draft}
                  lessons={lessons}
                  lessonGone={!lessonIds.has(c.lessonId)}
                  disabled={busy}
                  onEdit={edit}
                />
              ))}
            </ol>

            <Button
              variant="flat"
              className="self-start"
              disabled={busy || !firstLesson || draft.concepts.length >= CONCEPT_LIMITS.concepts}
              onClick={() => edit((d) => addConcept(d, firstLesson))}
            >
              <Plus /> {t("admin.learn.map.addConcept")}
            </Button>

            {savedHasConcepts && map?.status === "ready" && (
              <section className="mt-2 flex flex-col gap-2 border-t pt-4">
                <div>
                  <h4 className="font-heading text-sm font-semibold">{t("admin.learn.map.preview")}</h4>
                  <p className="text-xs text-muted-foreground">{t("admin.learn.map.previewHint")}</p>
                </div>
                <Suspense fallback={<Spinner className="mx-auto" />}>
                  <ReaderConceptMap readerId={readerId} />
                </Suspense>
              </section>
            )}
          </>
        )}
      </div>

      {/* Room for the save bar so it never covers the last row. */}
      {dirty && active && <div aria-hidden className="h-20" />}
      <SaveBar
        dirty={dirty && active}
        saving={saving}
        canSave={!issue && !busy}
        hint={issue ? t(`admin.learn.map.issue.${issue}`) : undefined}
        onSave={save}
        onReset={reset}
      />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.learn.map.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.learn.map.confirmText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void generate()}>
              {t("admin.learn.map.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** Server codes with their own inline message (the rest go to a toast). */
const ISSUE_CODES = { VALIDATION: 1, TOO_MANY: 1, DUPLICATE_ID: 1, UNKNOWN_LESSON: 1, UNKNOWN_CONCEPT: 1, SELF_LINK: 1, ALREADY_RUNNING: 1 } as const;

const GONE = "__gone__";

function ConceptRow({
  n,
  concept: c,
  draft,
  lessons,
  lessonGone,
  disabled,
  onEdit,
}: {
  n: number;
  concept: Concept;
  draft: ConceptMapData;
  lessons: AdminLessonRow[];
  lessonGone: boolean;
  disabled: boolean;
  onEdit: (fn: (d: ConceptMapData) => ConceptMapData) => void;
}) {
  const { t } = useTranslation();
  const base = `concept-${c.id}`;
  const name = (x: Concept) => x.label.trim() || t("admin.learn.map.unnamed");
  // Outgoing links with their index in `draft.links` (the edit helpers address links by index).
  const out = draft.links.flatMap((l, i) => (l.from === c.id ? [{ ...l, i }] : []));
  const targeted = new Set(out.map((l) => l.to));
  const others = draft.concepts.filter((x) => x.id !== c.id);
  const nextTarget = others.find((x) => !targeted.has(x.id));
  const labelEmpty = !c.label.trim();

  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground">{t("admin.learn.map.concept", { n })}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("admin.learn.map.removeConcept")}
          disabled={disabled}
          onClick={() => onEdit((d) => removeConcept(d, c.id))}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${base}-label`} className="text-sm font-bold">
              {t("admin.learn.map.label")}
            </label>
            <CharCounter value={c.label} max={CONCEPT_LIMITS.label} />
          </div>
          <Input
            id={`${base}-label`}
            value={c.label}
            maxLength={CONCEPT_LIMITS.label}
            autoComplete="off"
            disabled={disabled}
            aria-invalid={labelEmpty || undefined}
            onChange={(e) => onEdit((d) => updateConcept(d, c.id, { label: e.target.value.replace(/[\r\n\t]/g, " ") }))}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${base}-lesson`} className="text-sm font-bold">
            {t("admin.learn.map.lesson")}
          </label>
          <Select
            value={lessonGone ? GONE : c.lessonId}
            disabled={disabled}
            onValueChange={(v) => v !== GONE && onEdit((d) => updateConcept(d, c.id, { lessonId: v }))}
          >
            <SelectTrigger id={`${base}-lesson`} aria-invalid={lessonGone || undefined} className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lessonGone && (
                <SelectItem value={GONE} disabled>
                  {t("admin.learn.map.lessonGone")}
                </SelectItem>
              )}
              {lessons.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.code} · {l.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${base}-desc`} className="text-sm font-bold">
              {t("admin.learn.map.description")}
            </label>
            <CharCounter value={c.description} max={CONCEPT_LIMITS.description} />
          </div>
          <Textarea
            id={`${base}-desc`}
            value={c.description}
            maxLength={CONCEPT_LIMITS.description}
            disabled={disabled}
            rows={2}
            onChange={(e) => onEdit((d) => updateConcept(d, c.id, { description: e.target.value }))}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t pt-3">
        <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Link2 className="size-3.5" aria-hidden /> {t("admin.learn.map.links")}
        </span>
        {out.map((l) => (
          <div key={l.i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Input
              aria-label={t("admin.learn.map.relation")}
              placeholder={t("admin.learn.map.relationPlaceholder")}
              value={l.label}
              maxLength={CONCEPT_LIMITS.relation}
              autoComplete="off"
              disabled={disabled}
              className="min-w-0 flex-1 basis-40"
              onChange={(e) => onEdit((d) => updateLink(d, l.i, { label: e.target.value.replace(/[\r\n\t]/g, " ") }))}
            />
            <span aria-hidden className="text-primary">
              →
            </span>
            <Select value={l.to} disabled={disabled} onValueChange={(v) => onEdit((d) => updateLink(d, l.i, { to: v }))}>
              <SelectTrigger aria-label={t("admin.learn.map.linkTarget")} className="min-w-0 flex-1 basis-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {others
                  .filter((x) => x.id === l.to || !targeted.has(x.id))
                  .map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {name(x)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-sm" aria-label={t("admin.learn.map.removeLink")} disabled={disabled} onClick={() => onEdit((d) => removeLink(d, l.i))}>
              <X />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={disabled || !nextTarget || draft.links.length >= CONCEPT_LIMITS.links}
          onClick={() => nextTarget && onEdit((d) => addLink(d, c.id, nextTarget.id, ""))}
        >
          <Plus /> {t("admin.learn.map.addLink")}
        </Button>
      </div>
    </li>
  );
}
