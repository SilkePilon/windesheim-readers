import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Network, X } from "lucide-react";
import type { Concept } from "@shared/concept-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupConcepts, linkCurve, masteryTone, relationsOf, type ConceptTone, type MapLesson, type Relation } from "@/lib/concept-layout";
import { prefersReducedMotion } from "@/lib/motion";
import { useConceptMap } from "@/lib/queries";
import type { ReaderConceptMap as MapData } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Above this many concepts the map gets a week filter. */
const FILTER_FROM = 40;

const TONE_CHIP: Record<ConceptTone, string> = {
  new: "bg-card text-card-foreground border-border shadow-[0_3px_0_var(--chunky)]",
  learning: "bg-primary/12 text-foreground border-primary/45 shadow-[0_3px_0_color-mix(in_oklab,var(--primary)_40%,transparent)]",
  mastered: "bg-success text-success-foreground border-success-shade shadow-[0_3px_0_var(--success-shade)]",
};
const TONE_DOT: Record<ConceptTone, string> = {
  new: "bg-card border-border",
  learning: "bg-primary/25 border-primary/60",
  mastered: "bg-success border-success-shade",
};

/**
 * "Conceptkaart" (spec: "Concept map: focus redesign"): week sections → lesson cards → concept
 * chips, no lines at rest. Tapping a chip focuses it: its neighbours get a ring, the rest dims,
 * only its links are drawn, and a non-modal panel (fixed above the dock on phones, sticky beside
 * the map from md) explains them. Renders nothing while loading or when the map is not
 * available (404). Labels are admin/AI text: text nodes only.
 */
export function ReaderConceptMap({ readerId }: { readerId: string }) {
  const { data } = useConceptMap(readerId);
  const [focusId, setFocusId] = useState<string | null>(null);
  if (!data || !data.concepts.length) return null;
  return <ConceptMapBody data={data} focusId={focusId} onFocus={setFocusId} />;
}

export default ReaderConceptMap;

type Box = { x: number; y: number; w: number; h: number };

/** The map for given data and focus (controlled, so it renders the same on the server). */
export function ConceptMapBody({ data, focusId, onFocus = () => {} }: { data: MapData; focusId: string | null; onFocus?: (id: string | null) => void }) {
  const { t, i18n } = useTranslation();
  const [week, setWeek] = useState("all");
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const reveal = useRef<{ id: string; force: boolean } | null>(null);
  const size = useSize(box);
  const marker = useId();
  const panelId = useId();
  const fontsReady = useFontsReady();

  const lessons = data.lessons;
  const lessonOf = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);
  const conceptOf = useMemo(() => new Map(data.concepts.map((c) => [c.id, c])), [data.concepts]);
  const grouped = useMemo(() => groupConcepts(data, lessons), [data, lessons]);
  const weeks = useMemo(() => grouped.map((g) => g.week), [grouped]);
  const filtering = data.concepts.length > FILTER_FROM && weeks.length > 1;
  const shown = filtering && week !== "all" ? grouped.filter((g) => String(g.week) === week) : grouped;

  const concept = focusId ? conceptOf.get(focusId) : undefined;
  const relations = useMemo(() => (concept ? relationsOf(concept.id, data) : []), [concept, data]);
  const near = useMemo(() => new Set(relations.map((r) => r.other.id)), [relations]);

  const focus = (id: string | null, force = false) => {
    if (id) {
      const w = lessonOf.get(conceptOf.get(id)?.lessonId ?? "")?.week;
      if (week !== "all" && String(w) !== week) setWeek("all");
      reveal.current = { id, force };
    }
    onFocus(id);
  };
  const close = () => {
    const id = focusId;
    onFocus(null);
    if (id) chips.current.get(id)?.focus({ preventScroll: true });
  };
  const changeWeek = (w: string) => {
    setWeek(w);
    if (concept && w !== "all" && String(lessonOf.get(concept.lessonId)?.week) !== w) onFocus(null);
  };

  // Escape clears the focus like the close button (keyboard focus returns to the chip), unless
  // something else (the week Select) already handled it. The ref keeps the listener stable.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!focusId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusId]);

  // A new focus starts the panel at its top.
  useEffect(() => {
    if (focusId) panel.current?.scrollTo({ top: 0 });
  }, [focusId]);

  // After a focus change: a jump from the panel always scrolls the chip into view; a tap only
  // when the phone panel now covers it.
  useEffect(() => {
    const r = reveal.current;
    if (!r || r.id !== focusId) return;
    reveal.current = null;
    const el = chips.current.get(r.id);
    if (!el) return;
    const p = panel.current;
    const covered = p && getComputedStyle(p).position === "fixed" && el.getBoundingClientRect().bottom > p.getBoundingClientRect().top;
    if (r.force || covered) el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    if (r.force) el.focus({ preventScroll: true });
  }, [focusId, week]);

  // The focused concept's links, measured from the chips' positions inside the map box.
  const [paths, setPaths] = useState<{ key: string; d: string }[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    const origin = el?.getBoundingClientRect();
    const rect = (id: string): Box | null => {
      const b = chips.current.get(id)?.getBoundingClientRect();
      return b && origin ? { x: b.left - origin.left, y: b.top - origin.top, w: b.width, h: b.height } : null;
    };
    const f = focusId ? rect(focusId) : null;
    const next = f
      ? relations.flatMap((r) => {
          const o = rect(r.other.id);
          return o ? [{ key: `${r.dir}:${r.other.id}`, d: r.dir === "out" ? linkCurve(f, o) : linkCurve(o, f) }] : [];
        })
      : [];
    setPaths((p) => (p.length || next.length ? next : p));
  }, [focusId, relations, week, size, fontsReady]);

  // Tapping empty map space (anything but a chip) clears the focus.
  const onMapClick = (e: MouseEvent) => {
    if (focusId && !(e.target as Element).closest("button")) onFocus(null);
  };

  return (
    <Card lang={i18n.language} className="gap-3 overflow-visible px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Network className="size-5 text-primary" aria-hidden /> {t("readerLearn.map.heading")}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">{t("readerLearn.map.hint")}</p>
        </div>
        {filtering && (
          <Select value={week} onValueChange={changeWeek}>
            <SelectTrigger aria-label={t("readerLearn.map.filterLabel")} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("readerLearn.map.allWeeks")}</SelectItem>
              {weeks.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {t("readerLearn.map.week", { week: w })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs font-semibold text-muted-foreground">
        {(["new", "learning", "mastered"] as const).map((tone) => (
          <li key={tone} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-full border-2", TONE_DOT[tone])} />
            {t(`readerLearn.map.tone.${tone}`)}
          </li>
        ))}
      </ul>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem] md:items-start lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* The visual map (chips are real buttons); the list below carries the same content for screen readers. */}
        <div ref={box} onClick={onMapClick} className="relative flex min-w-0 flex-col gap-4">
          {shown.map((g) => (
            <section key={g.week} className="flex flex-col gap-2">
              <h3 className="px-2 font-heading text-sm font-semibold text-muted-foreground">{t("readerLearn.map.week", { week: g.week })}</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-2">
                {g.lessons.map(({ lesson, concepts }) => {
                  const tone = masteryTone(lesson.mastery);
                  return (
                    <div key={lesson.id} className="flex flex-col gap-2.5 rounded-[20px] bg-muted/45 p-3">
                      <div className="flex items-start gap-2 px-0.5">
                        <span aria-hidden className={cn("mt-1 size-3 shrink-0 rounded-full border-2", TONE_DOT[tone])} />
                        <p className="min-w-0 text-sm leading-snug break-words hyphens-auto">
                          <span className="font-heading font-semibold">{lesson.code}</span>{" "}
                          <span className="font-semibold text-muted-foreground">{lesson.title}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {concepts.map((c) => {
                          const on = c.id === focusId;
                          return (
                            <button
                              key={c.id}
                              ref={(el) => {
                                if (el) chips.current.set(c.id, el);
                                else chips.current.delete(c.id);
                              }}
                              type="button"
                              aria-pressed={on}
                              aria-controls={on ? panelId : undefined}
                              onClick={() => (on ? onFocus(null) : focus(c.id))}
                              className={cn(
                                "relative z-20 max-w-full rounded-[14px] border-2 px-3 py-1.5 text-left text-[14px] leading-snug font-bold break-words hyphens-auto whitespace-normal outline-none",
                                "transition-[opacity,transform,box-shadow] duration-200 active:translate-y-[2px] focus-visible:ring-3 focus-visible:ring-ring/50 max-md:scroll-mb-[50dvh]",
                                TONE_CHIP[tone],
                                on && "ring-4 ring-primary",
                                concept && !on && (near.has(c.id) ? "ring-3 ring-primary/45" : "opacity-35"),
                              )}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {paths.length > 0 && (
            <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible" fill="none">
              <defs>
                <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" className="fill-primary" />
                </marker>
              </defs>
              {paths.map((p) => (
                <path key={p.key} data-link d={p.d} strokeWidth={2.5} strokeLinecap="round" className="stroke-primary/70" markerEnd={`url(#${marker})`} />
              ))}
            </svg>
          )}
        </div>

        {concept ? (
          <aside
            ref={panel}
            id={panelId}
            role="region"
            aria-label={concept.label}
            className={cn(
              "fixed inset-x-3 bottom-[calc(152px+env(safe-area-inset-bottom))] z-30 max-h-[45dvh] overflow-y-auto overscroll-contain rounded-[24px] bg-card text-card-foreground",
              "shadow-[0_5px_0_var(--chunky),0_14px_28px_-12px_rgba(36,26,74,0.35)] dark:shadow-[0_5px_0_var(--chunky),0_14px_28px_-10px_rgba(0,0,0,0.6)]",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 md:motion-safe:slide-in-from-bottom-0",
              "md:sticky md:top-6 md:right-auto md:bottom-auto md:left-auto md:z-auto md:max-h-[calc(100dvh-3rem)] md:border-2 md:border-border md:shadow-[0_4px_0_var(--chunky)]",
            )}
          >
            <FocusPanel concept={concept} lesson={lessonOf.get(concept.lessonId)} relations={relations} onJump={(id) => focus(id, true)} onClose={close} />
          </aside>
        ) : (
          <p className="hidden rounded-[20px] border-2 border-dashed border-border p-4 text-sm font-semibold text-muted-foreground md:sticky md:top-6 md:block">
            {t("readerLearn.map.focusHint")}
          </p>
        )}
      </div>

      {/* Phones: room to scroll the last chips above the fixed panel. */}
      {concept && <div aria-hidden className="h-[45dvh] md:hidden" />}

      <ScreenReaderList data={data} weeks={weeks} lessonOf={lessonOf} conceptOf={conceptOf} />
    </Card>
  );
}

type T = ReturnType<typeof useTranslation>["t"];
const lessonLine = (t: T, l: MapLesson | undefined) => (l ? t("readerLearn.map.lessonOf", { code: l.code, title: l.title }) : "");

/** The panel: label, lesson line, description, links as sentences (tap to move the focus), "Open les". */
function FocusPanel({
  concept,
  lesson,
  relations,
  onJump,
  onClose,
}: {
  concept: Concept;
  lesson: MapLesson | undefined;
  relations: Relation[];
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tone = lesson ? masteryTone(lesson.mastery) : "new";
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground">
            <span aria-hidden className={cn("size-3 shrink-0 rounded-full border-2", TONE_DOT[tone])} />
            <span className="min-w-0 break-words">{lessonLine(t, lesson)}</span>
          </p>
          <h3 className="mt-1 font-heading text-xl leading-tight font-semibold text-balance break-words hyphens-auto">{concept.label}</h3>
        </div>
        <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-1 shrink-0 rounded-full" aria-label={t("readerLearn.map.close")} onClick={onClose}>
          <X />
        </Button>
      </div>
      {concept.description && <p className="text-[15px] leading-relaxed font-medium break-words hyphens-auto whitespace-pre-line">{concept.description}</p>}
      <div>
        <h4 className="mb-1 font-heading text-sm font-semibold text-muted-foreground">{t("readerLearn.map.links")}</h4>
        {relations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("readerLearn.map.noLinks")}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {relations.map((r) => (
              <li key={`${r.dir}:${r.other.id}`}>
                <LinkRow onClick={() => onJump(r.other.id)}>
                  {r.dir === "out" ? (
                    <>
                      <span aria-hidden className="text-primary">→</span> <em className="text-muted-foreground">{r.label}</em> <strong>{r.other.label}</strong>
                    </>
                  ) : (
                    <>
                      <span aria-hidden className="text-primary">←</span> <strong>{r.other.label}</strong> <em className="text-muted-foreground">{r.label}</em>
                    </>
                  )}
                </LinkRow>
              </li>
            ))}
          </ul>
        )}
      </div>
      {lesson && (
        <Button asChild variant="chunky" size="lg" className="self-start">
          <Link to={`/lesson/${lesson.id}`}>
            {t("readerLearn.map.openLesson", { code: lesson.code })} <ArrowRight aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  );
}

function LinkRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[14px] px-2 py-2 text-left text-[15px] leading-snug font-medium break-words hyphens-auto outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}

/** Always in the DOM: weeks → concepts (label, lesson, description, links), visually hidden. */
function ScreenReaderList({
  data,
  weeks,
  lessonOf,
  conceptOf,
}: {
  data: MapData;
  weeks: number[];
  lessonOf: Map<string, MapLesson>;
  conceptOf: Map<string, Concept>;
}) {
  const { t } = useTranslation();
  return (
    <div className="sr-only">
      <h3>{t("readerLearn.map.srHeading")}</h3>
      <ul>
        {weeks.map((w) => (
          <li key={w}>
            {t("readerLearn.map.week", { week: w })}
            <ul>
              {data.concepts
                .filter((c) => lessonOf.get(c.lessonId)?.week === w)
                .map((c) => {
                  const lesson = lessonOf.get(c.lessonId);
                  const links = data.links.filter((l) => l.from === c.id && conceptOf.has(l.to));
                  return (
                    <li key={c.id}>
                      {c.label}. {lessonLine(t, lesson)}
                      {lesson && <>, {t(`readerLearn.map.tone.${masteryTone(lesson.mastery)}`)}</>}. {c.description}
                      {links.length > 0 && (
                        <ul>
                          {links.map((l, i) => (
                            <li key={i}>
                              {l.label} {conceptOf.get(l.to)!.label}
                            </li>
                          ))}
                        </ul>
                      )}
                      {lesson && (
                        <>
                          {" "}
                          <Link to={`/lesson/${lesson.id}`}>{t("readerLearn.map.openLesson", { code: lesson.code })}</Link>
                        </>
                      )}
                    </li>
                  );
                })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The element's size as "w×h", kept current with a ResizeObserver ("" until measured). */
function useSize(ref: RefObject<HTMLElement | null>) {
  const [s, setS] = useState("");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (w: number, h: number) => setS(`${Math.round(w)}x${Math.round(h)}`);
    const b = el.getBoundingClientRect();
    read(b.width, b.height);
    const ro = new ResizeObserver(([e]) => read(e!.contentRect.width, e!.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return s;
}

/** Flips to true once webfonts have loaded, so chip positions (and curves) are measured again. */
function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
