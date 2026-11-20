import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CircleDot, Download, ExternalLink, Trash2 } from "lucide-react";
import { FEEDBACK_STATUSES, isGithubUrl, shortBrowser, type FeedbackContext, type FeedbackStatus, type FeedbackType } from "@shared/feedback";
import { formatInterval } from "@shared/format";
import { LIMITS } from "@shared/limits";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, type PillTone } from "@/components/admin/status-pill";
import { GithubIssueDialog, screenshotUrl } from "@/components/admin/github-issue-dialog";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import { notify } from "@/lib/notify";
import { qk } from "@/lib/queries";
import type { FeedbackRow } from "@/lib/types";

// Tailwind's `md`: a drawer below it, a dialog from it up.
const WIDE = "(min-width: 48rem)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isWide = () => window.matchMedia(WIDE).matches;

const STATUS_TONE: Record<FeedbackStatus, PillTone> = { new: "danger", in_progress: "warning", done: "success" };
const TYPE_TONE: Record<FeedbackType, PillTone> = { bug: "danger", idea: "busy", feedback: "track" };

export function FeedbackTypePill({ type }: { type: FeedbackType }) {
  const { t } = useTranslation();
  return (
    <Pill tone={TYPE_TONE[type]} dot={false}>
      {t(`feedback.types.${type}`)}
    </Pill>
  );
}

export function FeedbackStatusPill({ status }: { status: FeedbackStatus }) {
  const { t } = useTranslation();
  return <Pill tone={STATUS_TONE[status]}>{t(`admin.inbox.status.${status}`)}</Pill>;
}

/** "3 min geleden": compact, from the shared interval formatter. */
export function useTimeAgo() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en" : "nl";
  return (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    return ms < 60_000 ? t("admin.inbox.justNow") : t("admin.inbox.ago", { time: formatInterval(ms, locale) });
  };
}

/** PATCH a report, then refresh the inbox and the new-report count (same query prefix). */
export function usePatchFeedback(id: string) {
  const qc = useQueryClient();
  return async (body: { status?: FeedbackStatus; githubUrl?: string | null }) => {
    await api.patch(`/admin/feedback/${encodeURIComponent(id)}`, body);
    await qc.invalidateQueries({ queryKey: qk.adminFeedback });
  };
}

/**
 * One report: a drawer on phones, a dialog from `md` up. Everything the reporter sent
 * (message, context) is rendered as plain text only.
 */
export function FeedbackDetail({
  row,
  repo,
  open,
  onOpenChange,
}: {
  row: FeedbackRow | null;
  repo: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  // The last row stays shown while the panel closes (also after a delete removed it).
  const [kept, setKept] = useState(row);
  if (row && row !== kept) setKept(row);
  const r = row ?? kept;
  if (!r) return null;

  const body = <DetailBody key={r.id} row={r} repo={repo} onClose={() => onOpenChange(false)} />;
  const title = t("admin.inbox.detail");

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6 pb-2 pr-12">
            <DialogTitle className="font-heading text-xl font-semibold">{title}</DialogTitle>
            <DialogDescription className="sr-only">{t("admin.inbox.message")}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh] bg-card data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
        <div className="overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-5 pt-3 pb-2 text-left md:text-left">
            <DrawerTitle className="font-heading text-xl font-semibold">{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{t("admin.inbox.message")}</DrawerDescription>
          </DrawerHeader>
          {body}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function DetailBody({ row, repo, onClose }: { row: FeedbackRow; repo: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const ago = useTimeAgo();
  const qc = useQueryClient();
  const patch = usePatchFeedback(row.id);
  const [savingStatus, setSavingStatus] = useState(false);
  const [link, setLink] = useState(row.githubUrl ?? "");
  const [savingLink, setSavingLink] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);

  const trimmedLink = link.trim();
  const linkInvalid = trimmedLink !== "" && !isGithubUrl(trimmedLink);

  const setStatus = async (status: FeedbackStatus) => {
    if (status === row.status) return;
    setSavingStatus(true);
    try {
      await patch({ status });
    } catch (e) {
      notify.error(errorText(e, t));
    } finally {
      setSavingStatus(false);
    }
  };

  const saveLink = async () => {
    const next = trimmedLink || null;
    if (linkInvalid || next === row.githubUrl || savingLink) return;
    setSavingLink(true);
    try {
      await patch({ githubUrl: next });
      notify.success(t("admin.inbox.githubSaved"));
    } catch (e) {
      notify.error(errorText(e, t));
    } finally {
      setSavingLink(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/admin/feedback/${encodeURIComponent(row.id)}`);
      notify.success(t("admin.inbox.deleted"));
      onClose();
      await qc.invalidateQueries({ queryKey: qk.adminFeedback });
    } catch (e) {
      notify.error(errorText(e, t));
    } finally {
      setDeleting(false);
    }
  };

  const src = screenshotUrl(row.id);

  return (
    <div className="grid gap-5 px-5 pb-5 text-sm md:px-6 md:pb-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <FeedbackTypePill type={row.type} />
        <FeedbackStatusPill status={row.status} />
        <span className="text-xs text-muted-foreground" title={new Date(row.createdAt).toLocaleString(i18n.language)}>
          {ago(row.createdAt)}
        </span>
      </div>

      <Section title={t("admin.inbox.message")}>
        {/* Plain text, whitespace kept; each paragraph picks its own direction (bidi characters stay contained). */}
        <p className="rounded-xl bg-muted/60 p-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words [unicode-bidi:plaintext]">
          {row.message}
        </p>
      </Section>

      <Section title={t("admin.inbox.reporter")}>
        {row.reporter ? (
          <div className="min-w-0">
            <bdi className="block truncate font-bold">{row.reporter.name}</bdi>
            <bdi className="block truncate text-xs text-muted-foreground select-all">{row.reporter.email}</bdi>
          </div>
        ) : (
          <p className="text-muted-foreground">{t("admin.inbox.deletedUser")}</p>
        )}
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <label htmlFor={`fb-status-${row.id}`} className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("admin.inbox.statusLabel")}
          </label>
          <Select value={row.status} disabled={savingStatus} onValueChange={(v) => void setStatus(v as FeedbackStatus)}>
            <SelectTrigger id={`fb-status-${row.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`admin.inbox.status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={`fb-gh-${row.id}`} className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("admin.inbox.githubLink")}
          </label>
          <div className="flex gap-2">
            <Input
              id={`fb-gh-${row.id}`}
              type="url"
              inputMode="url"
              value={link}
              maxLength={LIMITS.feedback.githubUrl}
              placeholder="https://github.com/…/issues/1"
              autoComplete="off"
              spellCheck={false}
              disabled={savingLink}
              aria-invalid={linkInvalid || undefined}
              aria-describedby={`fb-gh-${row.id}-hint`}
              onChange={(e) => setLink(e.target.value)}
              onBlur={() => void saveLink()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveLink();
                }
              }}
            />
            {row.githubUrl && isGithubUrl(row.githubUrl) && (
              <Button asChild variant="outline" size="icon-lg" className="shrink-0">
                <a href={row.githubUrl} target="_blank" rel="noopener noreferrer" aria-label={t("admin.inbox.openIssue")}>
                  <ExternalLink />
                </a>
              </Button>
            )}
          </div>
          <p
            id={`fb-gh-${row.id}-hint`}
            role={linkInvalid ? "alert" : undefined}
            className={linkInvalid ? "text-xs font-semibold text-danger-shade dark:text-danger" : "text-xs text-muted-foreground"}
          >
            {linkInvalid ? t("admin.inbox.githubInvalid") : t("admin.inbox.githubHint")}
          </p>
        </div>
      </div>

      {row.hasScreenshot && !imgFailed && (
        <Section title={t("admin.inbox.screenshot")}>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("admin.inbox.screenshotOpen")}
            className="block overflow-hidden rounded-xl ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <img src={src} alt={t("admin.inbox.screenshotAlt")} loading="lazy" onError={() => setImgFailed(true)} className="max-h-80 w-full bg-muted object-contain" />
          </a>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={src} download={`feedback-${row.id}`}>
                <Download /> {t("admin.inbox.download")}
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={src} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> {t("admin.inbox.screenshotOpen")}
              </a>
            </Button>
          </div>
        </Section>
      )}

      <Section title={t("admin.inbox.context")}>
        <ContextList context={row.context} />
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button variant="chunky" onClick={() => setGithubOpen(true)}>
          <CircleDot /> {t("admin.inbox.toGithub")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="ml-auto" disabled={deleting}>
              <Trash2 /> {t("admin.inbox.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("admin.inbox.delete")}</AlertDialogTitle>
              <AlertDialogDescription>{t("admin.inbox.deleteConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void remove()}>
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <GithubIssueDialog
        row={row}
        repo={repo}
        open={githubOpen}
        onOpenChange={setGithubOpen}
        onOpened={async () => {
          if (row.status !== "new") return;
          try {
            await patch({ status: "in_progress" });
          } catch (e) {
            notify.error(errorText(e, t));
          }
        }}
      />
    </div>
  );
}

/** The context as a definition list: every value is user-supplied, so plain text in a <bdi>. */
function ContextList({ context: c }: { context: FeedbackContext }) {
  const { t } = useTranslation();
  const v = (s: string | number | undefined) => (s === undefined || s === "" ? null : String(s));
  const rows: [string, string | null][] = [
    [t("feedback.ctx.path"), v(c.path)],
    [t("feedback.ctx.readerTitle"), v(c.readerTitle)],
    [t("feedback.ctx.lesson"), c.lessonTitle ? `${c.lessonCode ? `${c.lessonCode} · ` : ""}${c.lessonTitle}` : v(c.lessonCode)],
    [t("feedback.ctx.appVersion"), v(c.appVersion)],
    [t("feedback.ctx.browser"), v(c.browser) ?? shortBrowser(c.userAgent)],
    [t("feedback.ctx.viewport"), v(c.viewport)],
    [t("feedback.ctx.locale"), v(c.locale)],
    [t("feedback.ctx.theme"), v(c.theme)],
    [t("feedback.ctx.standalone"), c.standalone ? t("feedback.ctx.yes") : t("feedback.ctx.no")],
    [t("feedback.ctx.error"), c.error ? [c.error.status, c.error.code, c.error.message].filter((x) => x !== undefined && x !== "").join(" · ") : null],
    [t("admin.inbox.apiPath"), v(c.error?.apiPath)],
    [t("feedback.ctx.userAgent"), v(c.userAgent)],
  ];
  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        {rows
          .filter((r): r is [string, string] => r[1] !== null)
          .map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="font-bold text-muted-foreground">{k}</dt>
              <dd className="font-semibold break-words">
                <bdi>{val}</bdi>
              </dd>
            </div>
          ))}
      </dl>
      {c.error?.stack && (
        <details className="mt-1 rounded-xl bg-muted/60 p-3">
          <summary className="cursor-pointer text-[13px] font-bold">{t("admin.inbox.stack")}</summary>
          <pre className="mt-2 max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap break-all">{c.error.stack}</pre>
        </details>
      )}
    </>
  );
}
