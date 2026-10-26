import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PathGroup, PathNode } from "@shared/path";
import { LevelBar } from "@/components/game/level-bar";
import { cn } from "@/lib/utils";

// Chunky press: drop by the 6px shadow and lose it. Reduced motion: no movement.
const press =
  "transition-[translate,box-shadow] duration-100 motion-reduce:transition-none active:translate-y-1.5 motion-reduce:active:translate-y-0";

const NODE: Record<PathNode["state"], string> = {
  done: `h-16 w-[70px] text-base bg-success text-success-foreground shadow-[0_6px_0_var(--success-shade)] active:shadow-none motion-reduce:active:shadow-[0_6px_0_var(--success-shade)] ${press}`,
  current: `h-[72px] w-20 text-[19px] bg-primary text-primary-foreground shadow-[0_6px_0_var(--primary-shade),0_0_0_6px_var(--background),0_0_0_9px_var(--primary)] active:shadow-[0_0_0_6px_var(--background),0_0_0_9px_var(--primary)] motion-reduce:active:shadow-[0_6px_0_var(--primary-shade),0_0_0_6px_var(--background),0_0_0_9px_var(--primary)] ${press}`,
  started: `h-16 w-[70px] text-base bg-card text-primary shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--primary)_35%,transparent),0_6px_0_var(--chunky)] active:shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--primary)_35%,transparent)] motion-reduce:active:shadow-[inset_0_0_0_3px_color-mix(in_oklab,var(--primary)_35%,transparent),0_6px_0_var(--chunky)] ${press}`,
  new: `h-16 w-[70px] text-base bg-card text-muted-foreground shadow-[0_6px_0_var(--chunky)] active:shadow-none motion-reduce:active:shadow-[0_6px_0_var(--chunky)] ${press}`,
};

/**
 * The lesson path: groups and nodes reversed so the path climbs (finished lessons at the
 * bottom, newest on top), zig-zagging left and right. Each group ends in a "Week n"
 * divider below its first lesson. On mount the current node is scrolled to the centre.
 */
export function LessonPath({ groups, onOpen }: { groups: PathGroup[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const currentRef = useRef<HTMLButtonElement>(null);
  const currentId = groups.flatMap((g) => g.nodes).find((n) => n.state === "current")?.id;

  // Zig-zag side is counted from the first lesson, so the bottom of the path never moves.
  const sideOf = new Map(groups.flatMap((g) => g.nodes).map((n, i) => [n.id, i % 2 === 0 ? "left" : "right"] as const));

  useEffect(() => {
    if (!currentId) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [currentId]);

  return (
    <div className="flex flex-col items-center py-4">
      {[...groups].reverse().map((g) => (
        <section key={g.week} aria-label={t("common.week", { n: g.week })} className="flex w-full flex-col items-center gap-3">
          {[...g.nodes].reverse().map((n) => {
            const side = sideOf.get(n.id)!;
            const current = n.state === "current";
            const label = t("home.lessonLabel", { code: n.code, title: n.title });
            return (
              <div
                key={n.id}
                className={cn(
                  "flex flex-col items-center",
                  // The current node's ring reaches 9px past it: keep the bar and neighbours clear.
                  current ? "gap-4 py-2" : "gap-2.5",
                  side === "left" ? "-translate-x-11 md:-translate-x-16" : "translate-x-11 md:translate-x-16",
                )}
              >
                <div className="relative">
                  <button
                    ref={current ? currentRef : undefined}
                    type="button"
                    onClick={() => onOpen(n.id)}
                    aria-label={t("home.lessonAria", {
                      code: n.code,
                      title: n.title,
                      state: t(`home.lessonState.${n.state === "current" ? (n.mastery > 0 ? "started" : "new") : n.state}`),
                    })}
                    aria-current={current ? "step" : undefined}
                    title={label}
                    data-state={n.state}
                    className={cn(
                      "grid place-items-center rounded-[50%] font-heading font-bold outline-none select-none focus-visible:outline-3 focus-visible:outline-offset-[12px] focus-visible:outline-ring",
                      NODE[n.state],
                    )}
                  >
                    {n.code}
                  </button>
                  {current && (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      onClick={() => onOpen(n.id)}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 rounded-[10px] bg-foreground px-2.5 py-1.5 text-xs font-extrabold whitespace-nowrap text-background",
                        side === "left" ? "left-[calc(100%+20px)]" : "right-[calc(100%+20px)]",
                      )}
                    >
                      {t("home.continue")}
                    </button>
                  )}
                </div>
                <LevelBar size="sm" level={n.level} tone={n.state === "done" ? "success" : "primary"} />
              </div>
            );
          })}
          <div className="mt-3 mb-5 flex w-full items-center gap-3 px-6" aria-hidden>
            <span className="h-0.5 flex-1 rounded-full bg-track" />
            <span className="font-heading text-[13px] font-semibold text-muted-foreground">{t("common.week", { n: g.week })}</span>
            <span className="h-0.5 flex-1 rounded-full bg-track" />
          </div>
        </section>
      ))}
    </div>
  );
}
