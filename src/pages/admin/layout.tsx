import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { Page } from "@/components/page";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "readers", to: "/admin" },
  { key: "settings", to: "/admin/settings" },
  { key: "users", to: "/admin/users" },
] as const;

function activeTab(pathname: string) {
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/admin/users")) return "users";
  // Readers, a reader's structure and the lesson editor all live under "Readers".
  return "readers";
}

const ActionsSlot = createContext<HTMLElement | null>(null);

/** Renders its children into the admin header, right of the tabs (e.g. "Reader uploaden"). */
export function AdminActions({ children }: { children: ReactNode }) {
  const slot = useContext(ActionsSlot);
  return slot ? createPortal(children, slot) : null;
}

/**
 * Shell for every admin route: the "Beheer" title with segmented tabs (Readers /
 * AI-instellingen / Gebruikers) and an actions slot. Calm variant: denser 14px text.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = activeTab(pathname);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  return (
    <Page wide className="text-sm">
      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 md:mb-6">
        <div className="flex items-center gap-2.5">
          <img src="/brand/logo-mono-navy.svg" alt="" className="size-7 dark:hidden" />
          <img src="/brand/logo-mono-white.svg" alt="" className="hidden size-7 dark:block" />
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>
        </div>
        <nav
          aria-label={t("admin.title")}
          className="order-3 grid w-full auto-cols-fr grid-flow-col gap-1 rounded-xl bg-track p-[3px] md:order-2 md:w-auto"
        >
          {TABS.map((tab) => {
            const on = tab.key === active;
            return (
              <Link
                key={tab.key}
                to={tab.to}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "truncate rounded-[9px] px-1 py-1.5 text-center text-[13px] font-bold md:px-3 md:text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`admin.${tab.key}`)}
              </Link>
            );
          })}
        </nav>
        <div ref={setSlot} className="order-2 ml-auto flex items-center gap-2 empty:hidden md:order-3" />
      </header>
      <ActionsSlot.Provider value={slot}>{children}</ActionsSlot.Provider>
    </Page>
  );
}
