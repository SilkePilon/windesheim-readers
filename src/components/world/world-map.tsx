import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PathGroup, PathNode } from "@shared/path";
import { LevelBar } from "@/components/game/level-bar";
import { composeWorld, WORLD_WIDTH } from "@/lib/world/compose";
import { cn } from "@/lib/utils";
import { REGISTRY } from "./registry";
import { renderWorldSvg } from "./render";
import "./world.css";

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
 * The lesson path as a generated world (see docs/superpowers/specs/2026-10-27-lesson-world-design.md).
 * The art is one memoised, aria-hidden SVG (internal strings only, no user content); the
 * lessons are HTML buttons placed over it at the layout's node positions. Finished lessons sit
 * at the bottom, the path climbs. On mount the current node is scrolled to the centre.
 */
export function WorldMap({ seed, groups, onOpen }: { seed: string; groups: PathGroup[]; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const artRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const nodes = groups.flatMap((g) => g.nodes);
  const currentId = nodes.find((n) => n.state === "current")?.id;

  // Only ids, weeks and states shape the world; titles and levels don't.
  const signature = nodes.map((n) => `${n.id}:${n.week}:${n.state}`).join("|");
  const { layout, svg } = useMemo(() => {
    const layout = composeWorld(
      {
        seed,
        lessons: signature
          ? signature.split("|").map((s) => {
              const [id, week, state] = s.split(":");
              return { id, code: "", week: Number(week), state: state as PathNode["state"], level: 0, mastery: 0 };
            })
          : [],
      },
      REGISTRY,
    );
    const svg = renderWorldSvg(layout, {
      label: (b) => `${t("common.week", { n: b.week })} · ${t(`world.biome.${b.biome}`)}`,
      finaleLabel: (done) => t(done ? "world.finale.done" : "world.finale.closed"),
    });
    return { layout, svg };
    // `t` changes with the language, which is in the deps.
  }, [seed, signature, i18n.language]);

  const pos = new Map(layout.nodes.map((n) => [n.id, n]));

  // Animations only run in segments that are on screen.
  useEffect(() => {
    const segs = artRef.current?.querySelectorAll<SVGGElement>(".wseg");
    if (!segs?.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle("paused", !e.isIntersecting);
      },
      { rootMargin: "200px 0px" },
    );
    segs.forEach((s) => {
      s.classList.add("paused");
      io.observe(s);
    });
    return () => io.disconnect();
  }, [svg]);

  useEffect(() => {
    if (!currentId) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [currentId]);

  const H = layout.height;
  return (
    <div className="-mx-4 mt-2 md:mx-0">
      <div
        className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-t-[28px] md:rounded-[28px]"
        style={{ aspectRatio: `${WORLD_WIDTH} / ${H}` }}
      >
        <div ref={artRef} className="absolute inset-0" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
        {[...groups].reverse().map((g) => (
          <section key={g.week} aria-label={t("common.week", { n: g.week })}>
            {[...g.nodes].reverse().map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const current = n.state === "current";
              const inner = p.x < WORLD_WIDTH / 2 ? "right" : "left";
              return (
                <div
                  key={n.id}
                  className="absolute size-0"
                  style={{ left: `${(p.x / WORLD_WIDTH) * 100}%`, top: `${(p.y / H) * 100}%` }}
                >
                  <div className={cn("absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2", current && "world-bob")}>
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
                      title={t("home.lessonLabel", { code: n.code, title: n.title })}
                      data-state={n.state}
                      className={cn(
                        "grid place-items-center rounded-[50%] font-heading font-bold outline-none select-none focus-visible:outline-3 focus-visible:outline-offset-[12px] focus-visible:outline-ring",
                        NODE[n.state],
                      )}
                    >
                      {n.code}
                    </button>
                  </div>
                  {current && (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      onClick={() => onOpen(n.id)}
                      className={cn(
                        "absolute top-0 -translate-y-1/2 rounded-[10px] bg-foreground px-2.5 py-1.5 text-xs font-extrabold whitespace-nowrap text-background shadow-[0_3px_0_rgb(0_0_0/0.2)]",
                        inner === "right" ? "left-[60px]" : "right-[60px]",
                      )}
                    >
                      {t("home.continue")}
                    </button>
                  )}
                  <div className={cn("absolute left-0 -translate-x-1/2", current ? "top-[54px]" : "top-[46px]")}>
                    <LevelBar size="sm" level={n.level} tone={n.state === "done" ? "success" : "primary"} />
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
