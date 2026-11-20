import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink } from "lucide-react";
import { defaultIssueDraft, issueUrl } from "@shared/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CharCounter } from "@/components/char-counter";
import type { FeedbackRow } from "@/lib/types";

/** GitHub's own label names, never translated. */
const LABELS = ["bug", "enhancement", "feedback"] as const;
const TITLE_MAX = 120;

/** Same-origin, so the admin session cookie goes along. */
export const screenshotUrl = (id: string) => `/api/admin/feedback/${encodeURIComponent(id)}/screenshot`;

/**
 * "Naar GitHub": an editable issue draft (title, body, labels) opened as a prefilled
 * github.com "new issue" page. The draft never carries the reporter's name or email
 * (defaultIssueDraft leaves them out and redacts email-like strings).
 */
export function GithubIssueDialog({
  row,
  repo,
  open,
  onOpenChange,
  onOpened,
}: {
  row: FeedbackRow;
  repo: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** After GitHub opened: the caller moves a new report to in progress. */
  onOpened: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The form lives inside the content, so it remounts (a fresh draft) on every open. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl">
        <DraftForm row={row} repo={repo} onClose={() => onOpenChange(false)} onOpened={onOpened} />
      </DialogContent>
    </Dialog>
  );
}

function DraftForm({ row, repo, onClose, onOpened }: { row: FeedbackRow; repo: string; onClose: () => void; onOpened: () => Promise<void> }) {
  const { t } = useTranslation();
  const [start] = useState(() => defaultIssueDraft(row));
  const [title, setTitle] = useState(start.title);
  const [body, setBody] = useState(start.body);
  const [labels, setLabels] = useState<string[]>(start.labels);
  const info = useMemo(() => issueUrl(repo, { title, body, labels }), [repo, title, body, labels]);
  const canOpen = title.trim() !== "";

  const openGithub = () => {
    if (!canOpen) return;
    window.open(info.url, "_blank", "noopener,noreferrer");
    onClose();
    void onOpened();
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        openGithub();
      }}
    >
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-semibold">{t("admin.inbox.draft.title")}</DialogTitle>
        <DialogDescription>{t("admin.inbox.draft.description")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="gh-title" className="text-sm font-bold">
            {t("admin.inbox.draft.issueTitle")}
          </label>
          <CharCounter value={title} max={TITLE_MAX} />
        </div>
        <Input id="gh-title" value={title} maxLength={TITLE_MAX} autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="gh-body" className="text-sm font-bold">
          {t("admin.inbox.draft.body")}
        </label>
        <Textarea
          id="gh-body"
          value={body}
          spellCheck={false}
          aria-describedby={info.truncated ? "gh-body-truncated" : undefined}
          onChange={(e) => setBody(e.target.value)}
          className="max-h-[40dvh] min-h-40 font-mono text-xs md:text-xs"
        />
        {info.truncated && (
          <p id="gh-body-truncated" aria-live="polite" className="text-xs font-semibold text-warning-shade dark:text-warning">
            {t("admin.inbox.draft.truncated", { kept: info.keptChars, total: info.bodyChars })}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <span id="gh-labels" className="text-sm font-bold">
          {t("admin.inbox.draft.labels")}
        </span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          spacing={2}
          aria-labelledby="gh-labels"
          value={labels}
          onValueChange={setLabels}
          className="flex-wrap justify-start"
        >
          {LABELS.map((l) => (
            <ToggleGroupItem key={l} value={l} className="font-mono text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 p-3 text-[13px] font-semibold">
        <span className="min-w-0 flex-1">{t("admin.inbox.draft.note")}</span>
        {row.hasScreenshot && (
          <Button asChild variant="outline" size="sm">
            <a href={screenshotUrl(row.id)} download={`feedback-${row.id}`}>
              <Download /> {t("admin.inbox.draft.downloadScreenshot")}
            </a>
          </Button>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="chunky" disabled={!canOpen}>
          <ExternalLink /> {t("admin.inbox.draft.open")}
        </Button>
      </DialogFooter>
    </form>
  );
}
