import { useMe } from "@/lib/queries";
import { ADMIN_ITEM, NAV_ITEMS, type NavItem } from "./nav-core";

export * from "./nav-core";

/** Student items (with the Herhalen due badge) plus Beheer for admins. */
export function useNavItems(): NavItem[] {
  const { data: me } = useMe();
  const due = me?.stats.due ?? 0;
  const items = NAV_ITEMS.map((i) => (i.key === "review" ? { ...i, badge: due } : i));
  return me?.user.role === "admin" ? [...items, ADMIN_ITEM] : items;
}
