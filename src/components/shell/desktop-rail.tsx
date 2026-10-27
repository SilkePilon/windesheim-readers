import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { badgeText, isNavActive, type NavItem } from "./nav-items";

/**
 * Floating vertical icon rail (≥ md). Every child, including the logo, is the same
 * fixed 44×44 cell with its content centred by grid, so icons line up on one axis.
 * Admin sits below a divider.
 */
export function DesktopRail({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <nav
      aria-label={t("app.name")}
      className="vt-rail fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-[22px] bg-card p-2 shadow-[0_4px_0_var(--chunky)] md:flex"
    >
      <Link
        to="/"
        data-rail-cell
        className="grid size-11 place-items-center rounded-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <img src="/brand/logo.svg" alt={t("app.name")} className="size-11" />
      </Link>
      {items.map((item) => {
        const active = isNavActive(item.to, pathname);
        const label = t(`nav.${item.key}`);
        const ariaLabel = item.badge ? t("nav.withDue", { label, count: item.badge }) : label;
        const Icon = item.icon;
        return (
          <Fragment key={item.to}>
            {item.key === "admin" && <hr aria-hidden className="my-0.5 h-0.5 w-9 border-0 bg-track" />}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  aria-label={ariaLabel}
                  aria-current={active ? "page" : undefined}
                  data-rail-cell
                  className={cn(
                    "relative grid size-11 place-items-center rounded-[13px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-[22px]" strokeWidth={2.25} />
                  {!!item.badge && (
                    <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-danger px-1 text-center font-heading text-[11px] leading-5 font-semibold text-white tabular-nums ring-2 ring-card">
                      {badgeText(item.badge)}
                    </span>
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {label}
              </TooltipContent>
            </Tooltip>
          </Fragment>
        );
      })}
    </nav>
  );
}
