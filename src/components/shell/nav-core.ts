// Pure nav data and helpers: no i18n/DOM imports, so bun test can load them.
import { House, Info, Layers, Shield, Trophy, User, Zap, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  /** i18n key under `nav.` */
  key: "path" | "review" | "battle" | "leaderboard" | "profile" | "about" | "admin";
  icon: LucideIcon;
  /** Count shown as a badge on the icon (0 = no badge). */
  badge?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", key: "path", icon: House },
  { to: "/review", key: "review", icon: Layers },
  { to: "/battle", key: "battle", icon: Zap },
  { to: "/leaderboard", key: "leaderboard", icon: Trophy },
  { to: "/profile", key: "profile", icon: User },
];

export const ADMIN_ITEM: NavItem = { to: "/admin", key: "admin", icon: Shield };

/** Desktop rail only: the phone dock keeps its five tabs. */
export const ABOUT_ITEM: NavItem = { to: "/about", key: "about", icon: Info };

/** Rail items: About goes before the admin item (which sits below a divider), or last without one. */
export function railItems(items: NavItem[]): NavItem[] {
  const at = items.findIndex((i) => i.key === "admin");
  return at === -1 ? [...items, ABOUT_ITEM] : [...items.slice(0, at), ABOUT_ITEM, ...items.slice(at)];
}

/** Lesson pages belong to the path, so "Pad" stays lit there. */
export function isNavActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/" || pathname.startsWith("/lesson/");
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
