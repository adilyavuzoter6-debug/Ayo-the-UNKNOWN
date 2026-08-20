import {
  LayoutDashboard,
  Building2,
  Fish,
  Wheat,
  HeartPulse,
  ArrowLeftRight,
  Scissors,
  Droplets,
  Package,
  BarChart3,
  Users,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Main sidebar navigation, in display order. Kept separate from `settingsNavItem`. */
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { id: "farms", href: "/farms", label: "Çiftlikler", icon: Building2 },
  { id: "production", href: "/production", label: "Üretim", icon: Fish },
  { id: "feeding", href: "/feeding", label: "Yemleme", icon: Wheat },
  { id: "health", href: "/health", label: "Sağlık & Ölüm", icon: HeartPulse },
  { id: "transfers", href: "/transfers", label: "Transferler", icon: ArrowLeftRight },
  { id: "harvest", href: "/harvest", label: "Hasat", icon: Scissors },
  { id: "water-quality", href: "/water-quality", label: "Su Kalitesi", icon: Droplets },
  { id: "stocks", href: "/stocks", label: "Stoklar", icon: Package },
  { id: "costs", href: "/costs", label: "Maliyetler", icon: Wallet },
  { id: "reports", href: "/reports", label: "Raporlar", icon: BarChart3 },
  { id: "users", href: "/users", label: "Kullanıcılar", icon: Users },
];

export const SETTINGS_NAV_ITEM: NavItem = {
  id: "settings",
  href: "/settings",
  label: "Ayarlar",
  icon: Settings,
};

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_ITEMS, SETTINGS_NAV_ITEM];

/** Resolves the current page title from a pathname, e.g. "/farms/abc123" → "Çiftlikler". */
export function resolveNavTitle(pathname: string | null): string {
  if (!pathname) return "";
  const match = ALL_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? "";
}
