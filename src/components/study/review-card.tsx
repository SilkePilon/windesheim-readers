import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleAlert, RotateCcw, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import type { ReviewCard as ReviewCardData, ReviewResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatInterval } from "@shared/format";

type RatingKey = keyof ReviewCardData["intervals"];

// Light mode keeps dark text on these fills: white doesn't reach AA on mint/orange/pink/blue.
const RATINGS: { value: 1 | 2 | 3 | 4; key: RatingKey; icon: LucideIcon; className: string }[] = [
  { value: 1, key: "again", icon: RotateCcw, className: "bg-danger text-danger-foreground [--shade:var(--danger-shade)]" },
  { value: 2, key: "hard", icon: CircleAlert, className: "bg-hard text-warning-foreground [--shade:var(--hard-shade)]" },
  { value: 3, key: "good", icon: Check, className: "bg-success text-success-foreground [--shade:var(--success-shade)]" },
  { value: 4, key: "easy", icon: Zap, className: "bg-info text-info-foreground [--shade:var(--info-shade)]" },
];

/** Horizontal drag (px) past which a release rates the card: right = good, left = again. */
const SWIPE_THRESHOLD = 100;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One flashcard: tap or Space flips it; then rate with the 2×2 tiles, keys 1–4, or a swipe
 * (right = good, left = again). Posts the rating itself and reports it through `onRated`.
 * Fetching and queue handling belong to the caller.
 */
export function ReviewCard({
  card,
  onRated,
}: {
  card: ReviewCardData;
  onRated: (r: { rating: 1 | 2 | 3 | 4; result: ReviewResult }) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en" : "nl";
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  // A card that just came up (after a rating) slides in; turning one back pops.
  const [entering, setEntering] = useState(true);

  const flip = useCallback((to?: boolean) => {
    setEntering(false);
    setFlipped((f) => to ?? !f);
  }, []);
  // Synchronous guard against double ratings (keys, taps and a swipe's fly-off delay).
  const lock = useRef(false);

  const rate = useCallback(
    async (rating: number, claimed = false) => {
      if (lock.current && !claimed) return;
      lock.current = true;
      setBusy(true);
      try {
        const result = await api.post<ReviewResult>("/review", { flashcardId: card.id, rating });
        celebrate(result, { quietXp: true });
        setFlipped(false);
        setEntering(true);
        onRated({ rating: rating as 1 | 2 | 3 | 4, result });
      } finally {
        lock.current = false;
        setDx(0);
        setBusy(false);
      }
    },
    [card, onRated],
  );

  // Keys: Space/Enter flip, 1–4 rate (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "Enter") {
        // Leave real buttons and links to their own activation.
        if (e.target instanceof HTMLElement && e.target.closest("button, a")) return;
        e.preventDefault();
        if (e.repeat) return; // holding Space must not flicker the card
        flip();
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        void rate(Number(e.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, rate, flip]);

  // ----- swipe (only once flipped) -----
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const dragged = useRef(false);
  const dxRef = useRef(0);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (!flipped || busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, active: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
        d.active = true;
        dragged.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      } else if (Math.abs(my) > 8) {
        drag.current = null; // vertical: let the page scroll
        return;
      } else return;
    }
    dxRef.current = mx;
    setDx(mx);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    setDragging(false);
    const x = dxRef.current;
    dxRef.current = 0;
    // A cancelled gesture (the browser took it over) never rates: always spring back.
    if (e.type === "pointercancel" || Math.abs(x) <= SWIPE_THRESHOLD) {
      setDx(0); // spring back
      return;
    }
    const rating = x > 0 ? 3 : 1;
    if (reducedMotion()) {
      void rate(rating);
      return;
    }
    if (lock.current) return setDx(0);
    lock.current = true;
    setBusy(true);
    setDx(Math.sign(x) * window.innerWidth); // fly off, then rate
    window.setTimeout(() => void rate(rating, true), 180);
  };

  const stamp = dx > 24 ? "good" : dx < -24 ? "again" : null;
  const stampOpacity = Math.min(1, (Math.abs(dx) - 24) / (SWIPE_THRESHOLD - 24));
  return (
    <div className="flex flex-1 flex-col pt-3">
      {/* Card */}
      <div className="flex flex-1 flex-col [perspective:1200px] md:flex-none">
        {/* Re-keyed per card and side: a new card pops in, flipping swings the card round. */}
        <div
          key={`${card.id}:${flipped}:${entering}`}
          className={cn(
            "flex flex-1 flex-col motion-reduce:animate-none",
            flipped ? "animate-card-flip" : entering ? "animate-card-in" : "animate-pop",
          )}
        >
        <div
          role="button"
          tabIndex={0}
          aria-label={flipped ? undefined : t("cards.tapToFlip")}
          data-slot="flashcard"
          data-flipped={flipped}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            flip();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            transform: dx ? `translateX(${dx}px) rotate(${dx / 18}deg)` : undefined,
            transition: dragging ? "none" : undefined,
          }}
          className={cn(
            "relative flex min-h-[min(52dvh,340px)] cursor-pointer flex-col rounded-[26px] bg-card p-5 text-card-foreground shadow-[0_6px_0_var(--chunky)] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 md:p-7",
            "touch-pan-y transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="rounded-[8px] bg-accent px-2 py-0.5 font-heading text-[13px] font-semibold text-primary">
              {card.lessonCode}
            </span>
            {card.isNew && <span className="font-extrabold text-muted-foreground">{t("cards.newCard")}</span>}
          </div>

          <div className={cn("flex flex-1 flex-col", !flipped && "items-center justify-center py-6 text-center")}>
            <p
              className={cn(
                "font-heading leading-tight font-semibold break-words hyphens-auto",
                flipped ? "mt-5 text-[22px] md:text-2xl" : "text-[26px] md:text-3xl",
              )}
            >
              {card.front}
            </p>
            {flipped && (
              <>
                <div className="my-4 h-0.5 rounded-full bg-accent" />
                <p className="text-base leading-relaxed font-bold break-words text-foreground/85 md:text-lg">{card.back}</p>
              </>
            )}
          </div>
          {!flipped && <p className="text-center text-xs font-bold text-muted-foreground">{t("cards.tapToFlip")}</p>}

          {stamp && (
            <span
              aria-hidden
              style={{ opacity: stampOpacity }}
              className={cn(
                "pointer-events-none absolute top-5 rounded-[12px] border-[3px] bg-card px-3 py-1 font-heading text-xl font-bold tracking-wide uppercase",
                stamp === "good"
                  ? "left-5 -rotate-12 border-success text-success-shade dark:text-success"
                  : "right-5 rotate-12 border-danger text-danger-shade dark:text-danger",
              )}
            >
              {stamp === "good" ? t("cards.good") : t("cards.again")}
            </span>
          )}
        </div>
        </div>
      </div>

      {/* Thumb zone */}
      <div className="sticky bottom-0 z-10 -mx-1 mt-4 bg-gradient-to-t from-background from-80% to-transparent px-1 pt-4 pb-[calc(6px+env(safe-area-inset-bottom))]">
        {flipped ? (
          <>
            <p className="mb-3 text-center text-xs font-bold text-muted-foreground">
              <span className="md:hidden">{t("cards.swipeHint")}</span>
              <span className="hidden md:inline">{t("cards.keyHint")}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              {RATINGS.map((r) => (
                <Button
                  key={r.value}
                  variant="chunky-surface"
                  disabled={busy}
                  onClick={() => void rate(r.value)}
                  className={cn(
                    "relative h-auto min-h-15 w-full min-w-0 justify-start gap-2 rounded-[18px] px-2.5 py-2.5 text-left whitespace-normal [--press:5px] min-[360px]:gap-2.5 min-[360px]:px-3",
                    r.className,
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-white/30 [&_svg]:size-[18px]">
                    <r.icon strokeWidth={2.6} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-heading text-[15px] leading-tight font-semibold break-words min-[360px]:text-[17px]">
                      {t(`cards.${r.key}`)}
                    </span>
                    <span className="font-sans text-xs leading-tight font-bold opacity-80">
                      {formatInterval(card.intervals[r.key], locale)}
                    </span>
                  </span>
                  <kbd className="absolute top-2 right-3 hidden font-sans text-[11px] font-extrabold opacity-60 md:block">{r.value}</kbd>
                </Button>
              ))}
            </div>
          </>
        ) : (
          <Button variant="chunky" size="xl" className="w-full" onClick={() => flip(true)}>
            {t("cards.showAnswer")}
          </Button>
        )}
      </div>
    </div>
  );
}
