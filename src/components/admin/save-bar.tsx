import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Unsaved-changes bar. Slides up from the bottom while `dirty`: above the floating dock
 * on mobile (dock 16px inset + 60px + 5px shadow), bottom-centred next to the rail on
 * desktop. Instant under prefers-reduced-motion. Hidden from focus and screen readers
 * while clean.
 */
export function SaveBar({
  dirty,
  onSave,
  onReset,
  saving,
  canSave = true,
  hint,
}: {
  dirty: boolean;
  onSave: () => void;
  onReset: () => void;
  saving?: boolean;
  canSave?: boolean;
  /** Replaces the default "unsaved changes" text, e.g. to explain why saving is blocked. */
  hint?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="region"
      aria-label={t("admin.unsaved")}
      aria-hidden={!dirty}
      inert={!dirty}
      className={cn(
        "fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-40 transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none md:bottom-6 md:left-28 md:right-8",
        dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[calc(100%+120px)] opacity-0",
      )}
    >
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 pl-4 text-sm shadow-[0_12px_32px_-12px_rgba(36,26,74,0.35)] max-sm:pt-3 sm:flex-nowrap dark:shadow-[0_12px_32px_-10px_rgba(0,0,0,0.6)]">
        <span className="min-w-0 basis-full truncate font-bold sm:flex-1 sm:basis-auto">
          <span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-warning align-middle" />
          {hint ?? t("admin.unsaved")}
        </span>
        <Button variant="flat" onClick={onReset} disabled={saving} className="max-sm:flex-1">
          <Undo2 /> {t("admin.undo")}
        </Button>
        <Button variant="chunky" onClick={onSave} disabled={!canSave || saving} className="max-sm:flex-1">
          {saving ? <Spinner /> : <Save />} {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
