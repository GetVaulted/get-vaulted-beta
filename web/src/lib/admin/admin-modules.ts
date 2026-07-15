export type AdminModuleId =
  | "live-shows"
  | "finance"
  | "fees"
  | "shipping-profiles"
  | "seller-risk"
  | "moderation"
  | "users"
  | "fulfillment"
  | "trust"
  | "support-tickets"
  | "notifications"
  | "health"
  | "listings"
  | "orders"
  | "reports"
  | "tax";

export type AdminModuleDef = {
  id: AdminModuleId;
  title: string;
  description: string;
  href: string;
  /** Legacy route that this module may deep-link into */
  legacyHref?: string;
  accent: "gold" | "emerald" | "amber" | "rose" | "sky";
};

export const ADMIN_MODULES: AdminModuleDef[] = [
  {
    id: "live-shows",
    title: "Live Shows",
    description: "Active, scheduled, and ended shows — stream health, auctions, viewer counts, admin controls.",
    href: "/admin/live-shows",
    accent: "rose",
  },
  {
    id: "finance",
    title: "Financial Analytics",
    description: "GMV, platform fees, payouts, refunds, and revenue trends.",
    href: "/admin/finance",
    accent: "emerald",
  },
  {
    id: "fees",
    title: "Rates & Fee Settings",
    description: "Marketplace fee, live selling tiers, payout program, layaway policy.",
    href: "/admin/fees",
    accent: "gold",
  },
  {
    id: "shipping-profiles",
    title: "Shipping Profiles",
    description: "Platform parcel defaults for Live, Marketplace, and Trade — weights, dims, bundle rules.",
    href: "/admin/shipping-profiles",
    accent: "sky",
  },
  {
    id: "seller-risk",
    title: "Seller Risk & Payout Review",
    description: "Payout tiers, GMV, standing, dispute rates, suspend or restore privileges.",
    href: "/admin/seller-risk",
    accent: "amber",
  },
  {
    id: "moderation",
    title: "Marketplace Moderation",
    description: "Pending, flagged, removed, and Vault Verified listings.",
    href: "/admin/moderation",
    legacyHref: "/admin/listings",
    accent: "sky",
  },
  {
    id: "users",
    title: "User Management",
    description: "Buyers, sellers, admins, suspension, verification, and Stripe Connect.",
    href: "/admin/users-management",
    legacyHref: "/admin/users",
    accent: "gold",
  },
  {
    id: "fulfillment",
    title: "Orders & Fulfillment",
    description: "Open, paid, shipped, delivered, disputed orders and layaways.",
    href: "/admin/fulfillment",
    legacyHref: "/admin/orders",
    accent: "emerald",
  },
  {
    id: "trust",
    title: "Reports & Trust & Safety",
    description: "User, listing, live, chat reports and fraud alerts.",
    href: "/admin/trust",
    legacyHref: "/admin/reports",
    accent: "rose",
  },
  {
    id: "support-tickets",
    title: "Support Tickets",
    description: "In-app support requests from buyers and sellers.",
    href: "/admin/support-tickets",
    accent: "amber",
  },
  {
    id: "notifications",
    title: "Mass Notifications",
    description: "Push a title, message, and link out to every user for events, drops, and deals.",
    href: "/admin/notifications",
    accent: "gold",
  },
  {
    id: "health",
    title: "Platform Health",
    description: "Supabase, API, Stripe webhooks, IVS, Shippo, and job failures.",
    href: "/admin/health",
    accent: "sky",
  },
  {
    id: "listings",
    title: "Listings (legacy)",
    description: "Full listing moderation table — remove, restore, mark reviewed.",
    href: "/admin/listings",
    accent: "gold",
  },
  {
    id: "orders",
    title: "Orders (legacy)",
    description: "Order search and detail views.",
    href: "/admin/orders",
    accent: "emerald",
  },
  {
    id: "reports",
    title: "Reports queue (legacy)",
    description: "Original trust & safety report queue.",
    href: "/admin/reports",
    accent: "rose",
  },
  {
    id: "tax",
    title: "Sales tax nexus",
    description: "Stripe Tax collection per state.",
    href: "/admin/tax",
    accent: "amber",
  },
];

export const ADMIN_PRIMARY_MODULES = ADMIN_MODULES.filter((m) =>
  [
    "live-shows",
    "finance",
    "fees",
    "shipping-profiles",
    "seller-risk",
    "moderation",
    "users",
    "fulfillment",
    "trust",
    "support-tickets",
    "notifications",
    "health",
  ].includes(m.id),
);

export const ADMIN_NAV_LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "Command Center", exact: true },
  { href: "/admin/live-shows", label: "Live" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/reconciliation", label: "Reconciliation" },
  { href: "/admin/fees", label: "Fees" },
  { href: "/admin/shipping-profiles", label: "Shipping" },
  { href: "/admin/seller-risk", label: "Seller Risk" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/users-management", label: "Users" },
  { href: "/admin/fulfillment", label: "Fulfillment" },
  { href: "/admin/trust", label: "Trust" },
  { href: "/admin/trust/linked-accounts", label: "Linked accounts" },
  { href: "/admin/support-tickets", label: "Support" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/tax", label: "Tax" },
];

export function adminAccentClasses(accent: AdminModuleDef["accent"]): { ring: string; text: string; bg: string } {
  switch (accent) {
    case "emerald":
      return { ring: "ring-emerald-500/20", text: "text-emerald-400", bg: "bg-emerald-500/10" };
    case "amber":
      return { ring: "ring-amber-500/20", text: "text-amber-400", bg: "bg-amber-500/10" };
    case "rose":
      return { ring: "ring-rose-500/20", text: "text-rose-400", bg: "bg-rose-500/10" };
    case "sky":
      return { ring: "ring-sky-500/20", text: "text-sky-400", bg: "bg-sky-500/10" };
    default:
      return { ring: "ring-gold/20", text: "text-gold-bright", bg: "bg-gold/10" };
  }
}
