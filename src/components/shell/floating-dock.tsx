import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { badgeText, isNavActive, type NavItem } from "./nav-items";

const CELL = 44; // inactive item: 44×44, icon only
const ICON = 22;
const PILL_PAD_X = 14;
const PILL_GAP = 6;

/**
 * Floating bottom dock (< md), inset 16px from the sides and the bottom plus the
 * safe-area inset. The active item is a purple chunky pill with its label; a single
 * absolutely positioned pill slides to the active item's measured offset. If the
 * label cannot fit next to the other icons (narrow phones with the admin item), the
 * pill stays icon-only and the label is kept for screen readers.
 */
export function FloatingDock({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeIndex = items.findIndex((i) => isNavActive(i.to, pathname));
  const activeLabel = activeIndex >= 0 ? t(`nav.${items[activeIndex].key}`) : "";

  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [compact, setCompact] = useState(false);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const labelW = measureRef.current?.offsetWidth ?? 0;
    const needed = (items.length - 1) * CELL + PILL_PAD_X * 2 + ICON + PILL_GAP + labelW;
    const nextCompact = needed > row.clientWidth;
    setCompact(nextCompact);
    // Position is read after the compact state has been applied (next layout pass).
    requestAnimationFrame(() => {
      const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null;
      if (!el) return setPill(null);
      // Sub-pixel rects: justify-between places items at fractional offsets.
      const r = el.getBoundingClientRect();
      setPill({ x: r.left - row.getBoundingClientRect().left, w: r.width });
    });
  }, [items.length, activeIndex]);

  useLayoutEffect(() => {
    measure();
  }, [measure, activeLabel]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(row);
    document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure]);

  // Only animate once the pill has a first position, so it never slides in from 0.
  useLayoutEffect(() => {
    if (pill && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pill, animate]);

  return (
    <nav
      aria-label={t("app.name")}
      className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-30 rounded-[26px] bg-card p-2 shadow-[0_5px_0_var(--chunky),0_14px_28px_-12px_rgba(36,26,74,0.35)] md:hidden dark:shadow-[0_5px_0_var(--chunky),0_14px_28px_-10px_rgba(0,0,0,0.6)]"
    >
      <div ref={rowRef} className="relative flex items-center justify-between">
        {/* Hidden measurer for the active label's natural width. */}
        <span
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 font-heading text-[15px] font-semibold whitespace-nowrap"
        >
          {activeLabel}
        </span>

        {pill && (
          <span
            aria-hidden
            className={cn(
              "absolute top-0 left-0 h-11 rounded-[18px] bg-primary shadow-[0_4px_0_var(--primary-shade)]",
              animate &&
                "transition-[translate,width] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none",
            )}
            style={{ translate: `${pill.x}px 0`, width: pill.w }}
          />
        )}

        {items.map((item, i) => {
          const active = i === activeIndex;
          const label = t(`nav.${item.key}`);
          const ariaLabel = item.badge ? t("nav.withDue", { label, count: item.badge }) : label;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              to={item.to}
              aria-label={ariaLabel}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative z-10 flex h-11 shrink-0 items-center justify-center rounded-[18px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active && !compact ? "gap-1.5 px-3.5" : "w-11",
                active
                  ? "text-primary-foreground transition-colors delay-150 duration-150 motion-reduce:transition-none motion-reduce:delay-0"
                  : "text-muted-foreground",
              )}
            >
              <span className="relative grid place-items-center">
                <Icon className="size-[22px]" strokeWidth={2.25} />
                {!!item.badge && (
                  <span className="absolute -top-2 -right-2.5 min-w-[18px] rounded-full bg-danger px-1 text-center font-heading text-[10px] leading-[18px] font-semibold text-white tabular-nums ring-2 ring-card">
                    {badgeText(item.badge)}
                  </span>
                )}
              </span>
              {active && !compact && (
                <span className="font-heading text-[15px] font-semibold whitespace-nowrap">{label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
