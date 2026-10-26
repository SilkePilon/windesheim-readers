import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Full-screen study mode (flashcards, quiz, review, battle play): a close button, a
 * chunky progress bar, an optional counter and a right-hand slot. Routes that use it
 * are rendered outside `AppLayout`, so there is no dock or rail.
 */
export function StudyShell({
  onClose,
  progress,
  counter,
  right,
  className,
  children,
}: {
  onClose: () => void;
  /** 0..1 */
  progress: number;
  counter?: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Button variant="chunky-surface" size="icon-xl" aria-label={t("common.close")} onClick={onClose} className="[--press:3px]">
            <X strokeWidth={2.5} />
          </Button>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-3.5 flex-1 overflow-hidden rounded-full bg-track"
          >
            <div
              className="h-full rounded-full bg-success shadow-[inset_0_-4px_0_var(--success-shade)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
          {counter != null && (
            <span className="shrink-0 font-heading text-sm font-semibold text-muted-foreground tabular-nums">{counter}</span>
          )}
          {right}
        </div>
      </header>
      <main
        className={cn(
          "mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-[calc(16px+env(safe-area-inset-bottom))]",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
