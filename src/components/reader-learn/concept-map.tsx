import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Network } from "lucide-react";
import type { Concept } from "@shared/concept-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { layoutConceptMap, masteryTone, type ConceptTone, type MapLesson } from "@/lib/concept-layout";
import { prefersReducedMotion } from "@/lib/motion";
import { useConceptMap } from "@/lib/queries";
import type { ReaderConceptMap as MapData } from "@/lib/types";
import { cn } from "@/lib/utils";

// Tailwind's `md`: a drawer below it, a dialog from it up (as the feedback sheet).
const WIDE = "(min-width: 48rem)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isWide = () => window.matchMedia(WIDE).matches;

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
 * "Conceptkaart": the reader's concepts as chips in week bands with soft curves between them.
 * Tapping a chip opens a sheet (drawer on phones, dialog on desktop). Renders nothing while
 * loading or when the map is not available (404). Labels are admin/AI text: text nodes only.
 */
export function ReaderConceptMap({ readerId }: { readerId: string }) {
  const { data } = useConceptMap(readerId);
  if (!data || !data.concepts.length) return null;
  return <ConceptMapCard data={data} />;
}

export default ReaderConceptMap;

function ConceptMapCard({ data }: { data: MapData }) {
  const { t } = useTranslation();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const [week, setWeek] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const jumpTo = useRef<string | null>(null);
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);

  const lessons = data.lessons;
  const lessonOf = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);
  const conceptOf = useMemo(() => new Map(data.concepts.map((c) => [c.id, c])), [data.concepts]);
  const weeks = useMemo(() => [...new Set(data.concepts.flatMap((c) => lessonOf.get(c.lessonId)?.week ?? []))].sort((a, b) => a - b), [data.concepts, lessonOf]);
  const filtering = data.concepts.length > FILTER_FROM && weeks.length > 1;
  const shown = useMemo(
    () => (filtering && week !== "all" ? { ...data, concepts: data.concepts.filter((c) => String(lessonOf.get(c.lessonId)?.week) === week) } : data),
    [data, filtering, week, lessonOf],
  );
  const layout = useMemo(() => (width > 0 ? layoutConceptMap(shown, lessons, width) : null), [shown, lessons, width]);

  const pick = (id: string) => {
    setSelected(id);
    setOpen(true);
  };
  // A link in the sheet: close it, then select, scroll to and focus the target chip.
  const jump = (id: string) => {
    const w = lessonOf.get(conceptOf.get(id)?.lessonId ?? "")?.week;
    if (week !== "all" && String(w) !== week) setWeek("all");
    jumpTo.current = id;
    setSelected(id);
    setOpen(false);
  };
  const onCloseAutoFocus = (e: Event) => {
    const id = jumpTo.current;
    if (!id) return;
    jumpTo.current = null;
    e.preventDefault();
    requestAnimationFrame(() => {
      const el = chips.current.get(id);
      el?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
    });
  };

  const concept = selected ? conceptOf.get(selected) : undefined;
  const header = (Title: typeof DialogTitle, Description: typeof DialogDescription) =>
    concept && (
      <>
        <Title className="font-heading text-[22px] leading-tight font-semibold text-balance break-words">{concept.label}</Title>
        <Description className="text-[15px] font-semibold text-muted-foreground">
          {lessonLine(t, lessonOf.get(concept.lessonId))}
        </Description>
      </>
    );
  const body = concept && <ConceptDetails concept={concept} data={data} conceptOf={conceptOf} lesson={lessonOf.get(concept.lessonId)} onJump={jump} />;

  return (
    <Card className="gap-3 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Network className="size-5 text-primary" aria-hidden /> {t("readerLearn.map.heading")}
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">
            {t("readerLearn.map.hint")}
          </p>
        </div>
        {filtering && (
          <Select value={week} onValueChange={setWeek}>
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

      {/* The visual map (chips are real buttons); the nested list below carries the same content for screen readers. */}
      <div ref={box} className="relative w-full" style={{ height: layout?.height ?? 0 }}>
        {layout && (
          <>
            {layout.bands.map((b) => (
              <div key={b.week} aria-hidden className="absolute inset-x-0 rounded-[20px] bg-muted/45" style={{ top: b.y, height: b.h }}>
                <span className="absolute top-2 left-4 font-heading text-sm font-semibold text-muted-foreground">{t("readerLearn.map.week", { week: b.week })}</span>
              </div>
            ))}
            <svg aria-hidden className="pointer-events-none absolute inset-0" width={width} height={layout.height} viewBox={`0 0 ${width} ${layout.height}`} fill="none">
              {layout.edges.map((e, i) => {
                const hot = selected !== null && (e.from === selected || e.to === selected);
                return (
                  <path
                    key={i}
                    d={e.d}
                    strokeWidth={hot ? 3 : 2}
                    strokeLinecap="round"
                    className={hot ? "stroke-primary" : "stroke-muted-foreground/35"}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((n) => (
              <button
                key={n.id}
                ref={(el) => {
                  if (el) chips.current.set(n.id, el);
                  else chips.current.delete(n.id);
                }}
                type="button"
                onClick={() => pick(n.id)}
                className={cn(
                  "absolute truncate rounded-full border-2 px-3 text-[14px] leading-none font-bold outline-none transition-transform active:translate-y-[2px] focus-visible:ring-3 focus-visible:ring-ring/50",
                  TONE_CHIP[n.tone],
                  selected === n.id && "ring-3 ring-primary/60",
                )}
                style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
              >
                {conceptOf.get(n.id)?.label}
              </button>
            ))}
          </>
        )}
      </div>

      <ScreenReaderList data={data} weeks={weeks} lessonOf={lessonOf} conceptOf={conceptOf} />

      {wide ? (
        <Dialog open={open && !!concept} onOpenChange={setOpen}>
          <DialogContent
            onCloseAutoFocus={onCloseAutoFocus}
            className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[26px] bg-card p-0 ring-0 shadow-[0_6px_0_var(--chunky),0_24px_48px_-16px_rgba(36,26,74,0.35)] sm:max-w-md dark:shadow-[0_6px_0_var(--chunky),0_24px_48px_-12px_rgba(0,0,0,0.6)]"
          >
            <DialogHeader className="gap-1.5 px-6 pt-6 pb-1 pr-12">{header(DialogTitle, DialogDescription)}</DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={open && !!concept} onOpenChange={setOpen}>
          <DrawerContent
            onCloseAutoFocus={onCloseAutoFocus}
            className="mx-auto max-h-[92dvh] max-w-md rounded-t-[26px] border-0 bg-card data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px] data-[vaul-drawer-direction=bottom]:border-t-0"
          >
            <div className="overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <DrawerHeader className="gap-1.5 px-6 pt-4 pb-1 text-left md:text-left">{header(DrawerTitle, DrawerDescription)}</DrawerHeader>
              {body}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </Card>
  );
}

type T = ReturnType<typeof useTranslation>["t"];
const lessonLine = (t: T, l: MapLesson | undefined) => (l ? t("readerLearn.map.lessonOf", { code: l.code, title: l.title }) : "");

/** The sheet body: description, the links in both directions (tap to jump) and "Open les <code>". */
function ConceptDetails({
  concept,
  data,
  conceptOf,
  lesson,
  onJump,
}: {
  concept: Concept;
  data: MapData;
  conceptOf: Map<string, Concept>;
  lesson: MapLesson | undefined;
  onJump: (id: string) => void;
}) {
  const { t } = useTranslation();
  const out = data.links.filter((l) => l.from === concept.id && conceptOf.has(l.to));
  const inc = data.links.filter((l) => l.to === concept.id && conceptOf.has(l.from));
  const tone = lesson ? masteryTone(lesson.mastery) : "new";
  return (
    <div className="flex flex-col gap-4 px-6 pt-2 pb-6">
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <span aria-hidden className={cn("size-3 rounded-full border-2", TONE_DOT[tone])} />
        {t(`readerLearn.map.tone.${tone}`)}
      </span>
      {concept.description && <p className="text-[15px] leading-relaxed break-words whitespace-pre-line">{concept.description}</p>}
      <div>
        <h3 className="mb-1.5 font-heading text-sm font-semibold text-muted-foreground">{t("readerLearn.map.links")}</h3>
        {out.length + inc.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("readerLearn.map.noLinks")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {out.map((l, i) => (
              <li key={`o${i}`}>
                <LinkRow onClick={() => onJump(l.to)}>
                  <span aria-hidden className="text-primary">→</span> <span className="text-muted-foreground">{l.label}</span>{" "}
                  <span className="font-bold">{conceptOf.get(l.to)!.label}</span>
                </LinkRow>
              </li>
            ))}
            {inc.map((l, i) => (
              <li key={`i${i}`}>
                <LinkRow onClick={() => onJump(l.from)}>
                  <span aria-hidden className="text-primary">←</span> <span className="font-bold">{conceptOf.get(l.from)!.label}</span>{" "}
                  <span className="text-muted-foreground">{l.label}</span>
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
      className="w-full rounded-[14px] px-2 py-2 text-left text-[15px] leading-snug break-words outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
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

/** The element's content width, kept current with a ResizeObserver (0 until measured). */
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
