import { useEffect, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { DesktopRail } from "@/components/shell/desktop-rail";
import { FloatingDock } from "@/components/shell/floating-dock";
import { useNavItems } from "@/components/shell/nav-items";

/**
 * Shell for every page except full-screen study mode: a floating dock on mobile and a
 * floating left rail on desktop. The bottom padding keeps the last content row clear
 * of the dock (16px inset + 60px dock + 5px shadow, plus breathing room).
 * Used as a layout route (renders the `Outlet`), or by a page that picks its own shell
 * per state (battle) with `children`.
 */
/** After first paint, fetch the world chunk so the home page doesn't wait for it (it stays out of the main bundle). */
function preloadWorld() {
  const load = () => void import("@/components/world/world-map").catch(() => {});
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(load, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(load, 1500);
  return () => clearTimeout(id);
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const items = useNavItems();
  const { pathname } = useLocation();
  useEffect(preloadWorld, []);
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <div className="min-h-dvh">
      <DesktopRail items={items} />
      <main className="pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-8 md:pl-28">
        <div className={cn("mx-auto w-full", isAdminPage ? "max-w-6xl" : "max-w-5xl")}>
          {children ?? <Outlet />}
        </div>
      </main>
      <FloatingDock items={items} />
    </div>
  );
}
