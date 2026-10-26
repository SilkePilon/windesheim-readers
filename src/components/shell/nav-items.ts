import { House, Layers, Shield, Trophy, User, Zap, type LucideIcon } from "lucide-react";
import { useMe } from "@/lib/queries";

export interface NavItem {
  to: string;
  /** i18n key under `nav.` */
  key: "path" | "review" | "battle" | "leaderboard" | "profile" | "admin";
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

/** Student items (with the Herhalen due badge) plus Beheer for admins. */
export function useNavItems(): NavItem[] {
  const { data: me } = useMe();
  const due = me?.stats.due ?? 0;
  const items = NAV_ITEMS.map((i) => (i.key === "review" ? { ...i, badge: due } : i));
  return me?.user.role === "admin" ? [...items, ADMIN_ITEM] : items;
}

/** Lesson pages belong to the path, so "Pad" stays lit there. */
export function isNavActive(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/" || pathname.startsWith("/lesson/");
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
