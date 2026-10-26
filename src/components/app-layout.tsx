import type { ReactNode } from "react";
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
export function AppLayout({ children }: { children?: ReactNode }) {
  const items = useNavItems();
  const { pathname } = useLocation();
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
