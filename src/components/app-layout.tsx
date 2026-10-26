import { NavLink, Outlet, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Home, LogOut, Repeat, Settings2, Swords, Trophy, User, Shield, Users, Library } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { StatChips } from "@/components/stat-chips";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", icon: Home, key: "nav.home", end: true },
  { to: "/learn", icon: BookOpen, key: "nav.learn" },
  { to: "/review", icon: Repeat, key: "nav.review", badge: "due" as const },
  { to: "/battle", icon: Swords, key: "nav.battle" },
  { to: "/leaderboard", icon: Trophy, key: "nav.leaderboard" },
];

const ADMIN_NAV = [
  { to: "/admin", icon: Library, key: "admin.readers", end: true },
  { to: "/admin/settings", icon: Settings2, key: "admin.settings" },
  { to: "/admin/users", icon: Users, key: "admin.users" },
];

function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await authClient.signOut();
    qc.clear();
    navigate("/login");
  };
}

function UserMenu() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/15 font-semibold text-primary">
            {me.user.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{me.user.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{me.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")}>
          <User /> {t("nav.profile")}
        </DropdownMenuItem>
        {me.user.role === "admin" && (
          <DropdownMenuItem onClick={() => navigate("/admin")}>
            <Shield /> {t("nav.admin")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SideLink({ to, icon: Icon, label, end, count }: { to: string; icon: typeof Home; label: string; end?: boolean; count?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      <Icon className="size-4.5" />
      <span className="flex-1">{label}</span>
      {!!count && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-semibold text-primary-foreground tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </NavLink>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const due = me?.stats.due ?? 0;
  const isAdmin = me?.user.role === "admin";

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <NavLink to="/" className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="size-8" />
          <span className="font-heading text-base font-semibold tracking-tight">{t("app.name")}</span>
        </NavLink>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <SideLink key={n.to} to={n.to} icon={n.icon} label={t(n.key)} end={n.end} count={n.badge ? due : undefined} />
          ))}
        </nav>
        {isAdmin && (
          <>
            <div className="mt-6 mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("nav.admin")}</div>
            <nav className="flex flex-col gap-1">
              {ADMIN_NAV.map((n) => (
                <SideLink key={n.to} to={n.to} icon={n.icon} label={t(n.key)} end={n.end} />
              ))}
            </nav>
          </>
        )}
        {me && (
          <NavLink to="/profile" className="mt-auto rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">{t("common.level", { n: me.stats.level })}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {me.stats.intoLevel}/{me.stats.levelSize} XP
              </span>
            </div>
            <Progress value={me.stats.progress * 100} className="h-2" />
          </NavLink>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-lg md:px-8">
          <NavLink to="/" className="flex items-center gap-2 md:hidden">
            <img src="/icon.svg" alt="" className="size-7" />
          </NavLink>
          <div className="flex-1" />
          <StatChips />
          <UserMenu />
        </header>

        <main className="flex-1 pb-24 md:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur-lg md:hidden">
          <div className="grid grid-cols-5">
            {NAV.map(({ to, icon: Icon, key, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn("relative rounded-full px-4 py-1 transition-colors", isActive && "bg-primary/10")}>
                      <Icon className="size-5" />
                      {badge && due > 0 && (
                        <span className="absolute -top-0.5 right-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground">
                          {due > 99 ? "99+" : due}
                        </span>
                      )}
                    </span>
                    {t(key)}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
