import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const TONES = {
  success: {
    sheet: "bg-[color-mix(in_oklab,var(--success)_18%,var(--card))] dark:bg-[color-mix(in_oklab,var(--success)_20%,var(--background))]",
    title: "text-success-shade dark:text-success",
    body: "text-[color-mix(in_oklab,var(--success-shade),var(--foreground)_55%)] dark:text-[color-mix(in_oklab,var(--success),white_55%)]",
    button: "chunky-success",
  },
  danger: {
    sheet: "bg-[color-mix(in_oklab,var(--danger)_16%,var(--card))] dark:bg-[color-mix(in_oklab,var(--danger)_20%,var(--background))]",
    title: "text-danger-shade dark:text-danger",
    body: "text-[color-mix(in_oklab,var(--danger-shade),var(--foreground)_55%)] dark:text-[color-mix(in_oklab,var(--danger),white_55%)]",
    button: "chunky-danger",
  },
} as const;

/**
 * Duolingo-style answer feedback: a mint (correct) or pink (wrong) sheet that slides up
 * from the bottom with a title, an explanation and a full-width next button. It also
 * renders an in-flow spacer of its own height, so the content above can scroll clear of it.
 *
 * With `autoAdvanceMs` the next button fills from left to right and then presses itself.
 * Tapping anywhere else on the sheet (to read the explanation) or leaving the tab stops it.
 */
export function FeedbackSheet({
  tone,
  title,
  body,
  nextLabel,
  onNext,
  busy,
  autoAdvanceMs,
}: {
  tone: "success" | "danger";
  title: ReactNode;
  body?: ReactNode;
  nextLabel: ReactNode;
  onNext: () => void;
  busy?: boolean;
  autoAdvanceMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const s = TONES[tone];
  const [auto, setAuto] = useState(!!autoAdvanceMs);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  useEffect(() => {
    if (!auto || !autoAdvanceMs) return;
    const timer = window.setTimeout(() => onNextRef.current(), autoAdvanceMs);
    const stop = () => document.hidden && setAuto(false);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [auto, autoAdvanceMs]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden style={{ height }} className="shrink-0" />
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        data-slot="feedback-sheet"
        data-tone={tone}
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest("button")) setAuto(false);
        }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 rounded-t-[26px] duration-300 ease-out animate-in slide-in-from-bottom motion-reduce:animate-none",
          s.sheet,
        )}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-1 px-4 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
          <p className={cn("font-heading text-xl leading-tight font-bold break-words", s.title)}>{title}</p>
          {body && <div className={cn("text-sm leading-snug font-bold break-words", s.body)}>{body}</div>}
          <Button
            autoFocus
            variant={s.button}
            size="xl"
            onClick={onNext}
            disabled={busy}
            className="relative mt-3 w-full overflow-hidden disabled:opacity-80"
          >
            {auto && autoAdvanceMs && (
              <span
                aria-hidden
                data-slot="auto-advance"
                className="pointer-events-none absolute inset-0 origin-right bg-white/40 motion-reduce:hidden"
                style={{ animation: `unveil-x ${autoAdvanceMs}ms linear forwards` }}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              {busy && <Spinner />}
              {nextLabel}
            </span>
          </Button>
        </div>
      </div>
    </>
  );
}
